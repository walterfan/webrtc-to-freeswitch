import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  URI,
  UserAgent,
} from "sip.js";
import { defaultSessionDescriptionHandlerFactory } from "sip.js/lib/platform/web/session-description-handler/session-description-handler-factory-default.js";
import { rejectControlCharacters, type UriBuilder } from "../services/destination";
import { appError, categoryFromSipStatus, categoryFromTransportError } from "../services/errors";
import { mediaConstraintsFor, type MediaMode } from "../types/domain";
import type {
  IncomingHandle,
  OutgoingHandle,
  SessionId,
  SipConnectInput,
  SipPort,
  SipTransportEvents,
} from "../ports/sip";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type SipAdapterDeps = {
  storage?: StorageLike;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
  mediaStreamFactory?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
};

type SessionRecord = {
  session: Session;
  id: SessionId;
  localStream?: MediaStream;
  removeRemoteTrackListener?: () => void;
};

export function createSipUriBuilder(): UriBuilder {
  return {
    parse(value: string) {
      rejectControlCharacters(value);
      return UserAgent.makeURI(value);
    },
    fromUserHost(user: string, host: string) {
      rejectControlCharacters(user);
      rejectControlCharacters(host);
      return new URI("sip", user, host);
    },
  };
}

function newSessionId(): SessionId {
  return crypto.randomUUID();
}

function identityFromInvitation(invitation: Invitation): { displayName: string; uri: string } {
  const from = invitation.remoteIdentity;
  const displayName = from?.displayName ?? from?.uri.user ?? "Unknown";
  const uri = from?.uri.toString() ?? "";
  return { displayName: String(displayName), uri };
}

export class SipJsAdapter implements SipPort {
  private userAgent: UserAgent | null = null;
  private registerer: Registerer | null = null;
  private password = "";
  private events: SipTransportEvents = {};
  private readonly sessions = new Map<SessionId, SessionRecord>();
  private readonly uriBuilder = createSipUriBuilder();
  private readonly storage: StorageLike | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly log: (message: string) => void;
  private readonly mediaStreamFactory:
    ((constraints: MediaStreamConstraints) => Promise<MediaStream>) | undefined;

  constructor(deps: SipAdapterDeps = {}) {
    this.storage = deps.storage;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.log = deps.log ?? (() => undefined);
    this.mediaStreamFactory = deps.mediaStreamFactory;
  }

  uri(): UriBuilder {
    return this.uriBuilder;
  }

  hasStoredPassword(): boolean {
    return this.password.length > 0;
  }

  bind(events: SipTransportEvents): void {
    this.events = events;
  }

  async connect(input: SipConnectInput): Promise<void> {
    this.assertNoLeak(input.password);
    this.password = input.password;
    const uri = this.uriBuilder.fromUserHost(input.username, input.domain);
    const userAgent = new UserAgent({
      uri: uri as URI,
      authorizationUsername: input.username,
      authorizationPassword: this.password,
      transportOptions: { server: input.webSocketUrl },
      sessionDescriptionHandlerFactoryOptions: {
        peerConnectionConfiguration: { iceServers: input.iceServers },
        iceGatheringTimeout: 5000,
      },
      ...(this.mediaStreamFactory
        ? {
            sessionDescriptionHandlerFactory: defaultSessionDescriptionHandlerFactory(
              this.mediaStreamFactory,
            ),
          }
        : {}),
      delegate: {
        onInvite: (invitation) => this.handleInvite(invitation),
        onNotify: (notification) => {
          void notification.accept();
        },
        onDisconnect: (error) => {
          if (error) {
            this.log(`sip_transport_disconnected category=${categoryFromTransportError(error)}`);
          }
          this.events.onTransportDisconnected?.();
        },
      },
    });
    this.userAgent = userAgent;
    try {
      await userAgent.start();
      this.attachTransportTrace(userAgent);
    } catch (error) {
      this.clearPassword();
      throw appError(categoryFromTransportError(error));
    }
  }

  async register(): Promise<void> {
    if (!this.userAgent) {
      throw appError("generic", "Signaling is not connected.");
    }
    const registerer = new Registerer(this.userAgent);
    this.registerer = registerer;
    registerer.stateChange.addListener((state) => {
      if (state === RegistererState.Registered) {
        this.events.onRegistered?.();
      }
      if (state === RegistererState.Unregistered) {
        this.events.onUnregistered?.();
      }
    });
    try {
      await registerer.register();
    } catch (error) {
      const status = sipStatus(error);
      if (status === 401 || status === 403 || status === 407) {
        throw appError("authentication");
      }
      throw appError(categoryFromTransportError(error));
    }
  }

  async unregister(): Promise<void> {
    if (this.registerer) {
      await this.registerer.unregister().catch(() => undefined);
    }
  }

  async disconnect(): Promise<void> {
    await this.unregister();
    if (this.userAgent) {
      await this.userAgent.stop().catch(() => undefined);
    }
    this.userAgent = null;
    this.registerer = null;
    for (const record of this.sessions.values()) {
      record.removeRemoteTrackListener?.();
    }
    this.sessions.clear();
    this.clearPassword();
  }

  async invite(targetUri: string, mediaMode: MediaMode): Promise<OutgoingHandle> {
    if (!this.userAgent) {
      throw appError("generic", "Signaling is not connected.");
    }
    const parsed = this.uriBuilder.parse(targetUri);
    if (!parsed) {
      throw appError("validation");
    }
    const sessionId = newSessionId();
    const inviter = new Inviter(this.userAgent, parsed as URI, {
      sessionDescriptionHandlerOptions: { constraints: mediaConstraintsFor(mediaMode) },
    });
    this.trackSession(sessionId, inviter);
    try {
      await inviter.invite();
    } catch (error) {
      this.removeSession(sessionId);
      throw error;
    }
    this.emitLocalStream(sessionId);
    return {
      sessionId,
      cancel: async () => {
        await inviter.cancel();
      },
    };
  }

  async sendDtmf(
    sessionId: SessionId,
    digit: string,
    preferredMethod: "rtp" | "info",
  ): Promise<"rtp" | "info"> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw appError("generic");
    }
    const canRtp = preferredMethod === "rtp" && this.hasTelephoneEvent(sessionId);
    if (canRtp) {
      const handler = record.session.sessionDescriptionHandler as {
        sendDtmf?: (tones: string) => boolean;
      } | null;
      if (handler?.sendDtmf?.(digit)) {
        return "rtp";
      }
    }
    await record.session.info({
      requestOptions: {
        body: {
          contentDisposition: "render",
          contentType: "application/dtmf-relay",
          content: `Signal=${digit}\r\nDuration=160`,
        },
      },
    });
    return "info";
  }

  hasTelephoneEvent(sessionId: SessionId): boolean {
    const record = this.sessions.get(sessionId);
    const handler = record?.session.sessionDescriptionHandler as {
      peerConnection?: RTCPeerConnection;
    } | null;
    const descriptions = [
      handler?.peerConnection?.localDescription?.sdp ?? "",
      handler?.peerConnection?.remoteDescription?.sdp ?? "",
    ];
    return descriptions.some((sdp) => /telephone-event/i.test(sdp));
  }

  private attachTransportTrace(userAgent: UserAgent): void {
    const transport = userAgent.transport;
    const originalSend = transport.send.bind(transport);
    transport.send = async (message: string) => {
      this.emitSipMessage("send", message);
      return originalSend(message);
    };
    const originalOnMessage = transport.onMessage?.bind(transport);
    transport.onMessage = (message: string) => {
      this.emitSipMessage("receive", message);
      originalOnMessage?.(message);
    };
  }

  private emitSipMessage(direction: "send" | "receive", raw: string): void {
    if (!raw.trim()) {
      return;
    }
    this.events.onSipMessage?.({
      id: crypto.randomUUID(),
      direction,
      at: Date.now(),
      raw,
    });
  }

  private handleInvite(invitation: Invitation): void {
    const sessionId = newSessionId();
    this.trackSession(sessionId, invitation);
    const identity = identityFromInvitation(invitation);
    const handle: IncomingHandle = {
      sessionId,
      identity,
      accept: async () => {
        await invitation.accept({
          sessionDescriptionHandlerOptions: { constraints: mediaConstraintsFor("audio") },
        });
      },
      reject: async () => {
        await invitation.reject();
      },
    };
    this.events.onInvitation?.(handle);
  }

  private trackSession(sessionId: SessionId, session: Session): void {
    this.sessions.set(sessionId, { session, id: sessionId });
    session.stateChange.addListener((state) => {
      if (state === SessionState.Establishing) {
        this.events.onOutgoingProgress?.(sessionId);
        this.emitLocalStream(sessionId);
      }
      if (state === SessionState.Established) {
        this.events.onOutgoingAccepted?.(sessionId);
        this.observeRemoteStream(sessionId);
      }
      if (state === SessionState.Terminated) {
        this.removeSession(sessionId);
        this.events.onSessionTerminated?.(sessionId);
      }
    });
  }

  private emitLocalStream(sessionId: SessionId): void {
    const record = this.sessions.get(sessionId);
    const stream = record ? localStream(record.session) : null;
    if (!record || !stream || record.localStream === stream) {
      return;
    }
    record.localStream = stream;
    this.events.onLocalStream?.(sessionId, stream);
  }

  private observeRemoteStream(sessionId: SessionId): void {
    const record = this.sessions.get(sessionId);
    const stream = record ? remoteStream(record.session) : null;
    if (!record || !stream) {
      return;
    }
    this.events.onRemoteStream?.(sessionId, stream);
    if (record.removeRemoteTrackListener || !stream.addEventListener) {
      return;
    }
    const onAddTrack = () => this.events.onRemoteStream?.(sessionId, stream);
    stream.addEventListener("addtrack", onAddTrack);
    record.removeRemoteTrackListener = () => stream.removeEventListener("addtrack", onAddTrack);
  }

  private removeSession(sessionId: SessionId): void {
    const record = this.sessions.get(sessionId);
    record?.removeRemoteTrackListener?.();
    this.sessions.delete(sessionId);
  }

  private clearPassword(): void {
    this.password = "";
    this.assertNoLeak("");
  }

  private assertNoLeak(password: string): void {
    if (!password) {
      return;
    }
    const stored = this.storage?.getItem("sipPassword");
    if (stored === password) {
      throw new Error("password leaked to storage");
    }
    this.log("sip_event category=connect");
  }
}

function localStream(session: Session): MediaStream | null {
  return mediaHandler(session)?.localMediaStream ?? null;
}

function remoteStream(session: Session): MediaStream | null {
  const remote = mediaHandler(session)?.remoteMediaStream;
  if (remote) {
    return remote;
  }
  return receiverStream(session);
}

function mediaHandler(session: Session): {
  localMediaStream?: MediaStream;
  remoteMediaStream?: MediaStream;
  peerConnection?: RTCPeerConnection;
} | null {
  return (
    (session.sessionDescriptionHandler as {
      localMediaStream?: MediaStream;
      remoteMediaStream?: MediaStream;
      peerConnection?: RTCPeerConnection;
    } | null) ?? null
  );
}

function receiverStream(session: Session): MediaStream | null {
  const handler = session.sessionDescriptionHandler as {
    peerConnection?: RTCPeerConnection;
  } | null;
  const peer = handler?.peerConnection;
  if (!peer) {
    return null;
  }
  const stream = new MediaStream();
  for (const receiver of peer.getReceivers()) {
    if (receiver.track) {
      stream.addTrack(receiver.track);
    }
  }
  return stream.getTracks().length > 0 ? stream : null;
}

function sipStatus(error: unknown): number | undefined {
  if (error && typeof error === "object" && "statusCode" in error) {
    return Number(error.statusCode);
  }
  return undefined;
}

export function mapSipFailure(status: number) {
  return appError(categoryFromSipStatus(status));
}

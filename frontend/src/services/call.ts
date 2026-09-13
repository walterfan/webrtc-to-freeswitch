import type { DtmfMethod, RuntimeConfig, SafeIdentity } from "../types/domain";
import type { IncomingHandle, SipPort } from "../ports/sip";
import type { MediaPort } from "../ports/media";
import { appError } from "./errors";
import { normalizeDestination, type UriBuilder } from "./destination";
import {
  canDispatchCall,
  initialCallState,
  isCurrentSession,
  reduceCall,
  type CallState,
} from "../state/call";

const DTMF_DIGIT = /^[0-9*#]$/;

export class CallService {
  private state = initialCallState();
  private readonly listeners = new Set<(state: CallState) => void>();
  private incoming: IncomingHandle | null = null;
  private cancelOutgoing: (() => Promise<void>) | null = null;
  private audioBlocked = false;
  lastDtmfMethod: DtmfMethod | null = null;
  lastDtmfDigit: string | null = null;

  constructor(
    private readonly sip: SipPort,
    private readonly media: MediaPort,
    private readonly uri: UriBuilder,
    private readonly audioElement: HTMLAudioElement,
  ) {}

  attach(hub: { add(listener: import("../ports/sip").SipTransportEvents): void }): void {
    hub.add({
      onInvitation: (invitation) => this.onInvitation(invitation),
      onOutgoingProgress: (sessionId) => {
        if (canDispatchCall(this.state, { type: "outgoing-ringing", sessionId })) {
          this.dispatch({ type: "outgoing-ringing", sessionId });
        }
      },
      onOutgoingAccepted: (sessionId) => {
        void this.onAccepted(sessionId);
      },
      onRemoteStream: (sessionId, stream) => {
        void this.onRemoteStream(sessionId, stream);
      },
      onSessionTerminated: (sessionId) => {
        void this.onRemoteEnded(sessionId);
      },
    });
  }

  getState(): CallState {
    return this.state;
  }

  isAudioBlocked(): boolean {
    return this.audioBlocked;
  }

  subscribe(listener: (state: CallState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  canDial(): boolean {
    return this.state.status === "idle";
  }

  canSendDtmf(): boolean {
    return this.state.status === "active";
  }

  async dial(destination: string, config: RuntimeConfig): Promise<void> {
    if (!this.canDial()) {
      throw appError("busy", "Another call is already in progress.");
    }
    let target: string;
    try {
      target = normalizeDestination(destination, config.sipDomain, this.uri);
    } catch {
      throw appError("validation");
    }
    await this.media.acquireMicrophone();
    try {
      const outgoing = await this.sip.invite(target);
      this.cancelOutgoing = () => outgoing.cancel();
      this.dispatch({
        type: "outgoing-start",
        sessionId: outgoing.sessionId,
        remote: { displayName: destination, uri: target },
      });
    } catch (error) {
      this.media.release();
      throw error;
    }
  }

  async answer(): Promise<void> {
    if (this.state.status !== "incoming-ringing" || !this.incoming) {
      return;
    }
    const sessionId = this.incoming.sessionId;
    await this.media.acquireMicrophone();
    try {
      await this.incoming.accept();
      this.dispatch({ type: "answer", sessionId });
      this.incoming = null;
    } catch (error) {
      this.media.release();
      throw error;
    }
  }

  async reject(): Promise<void> {
    if (!this.incoming || this.state.status !== "incoming-ringing") {
      return;
    }
    const sessionId = this.incoming.sessionId;
    await this.incoming.reject();
    this.incoming = null;
    this.finish(sessionId, "rejected");
  }

  async cancel(): Promise<void> {
    if (!this.state.sessionId || this.state.status === "idle") {
      return;
    }
    const sessionId = this.state.sessionId;
    this.dispatch({ type: "terminate", sessionId });
    await this.cancelOutgoing?.();
    this.finish(sessionId, "canceled");
  }

  async hangup(): Promise<void> {
    if (!this.state.sessionId) {
      return;
    }
    const sessionId = this.state.sessionId;
    this.dispatch({ type: "terminate", sessionId });
    this.finish(sessionId, "hangup");
  }

  toggleMute(): boolean {
    if (this.state.status !== "active") {
      return this.media.isMuted();
    }
    return this.media.setMuted(!this.media.isMuted());
  }

  async sendDtmf(digit: string, preferred: DtmfMethod): Promise<void> {
    if (!this.canSendDtmf() || !this.state.sessionId) {
      return;
    }
    if (!DTMF_DIGIT.test(digit)) {
      return;
    }
    this.lastDtmfDigit = digit;
    this.lastDtmfMethod = await this.sip.sendDtmf(this.state.sessionId, digit, preferred);
  }

  async enableAudio(): Promise<void> {
    await this.media.enableAudio(this.audioElement);
    this.audioBlocked = false;
    this.notify();
  }

  setAudioBlocked(blocked: boolean): void {
    this.audioBlocked = blocked;
    this.notify();
  }

  private onInvitation(invitation: IncomingHandle): void {
    if (this.state.status !== "idle") {
      void invitation.reject();
      return;
    }
    this.incoming = invitation;
    this.dispatch({
      type: "incoming",
      sessionId: invitation.sessionId,
      remote: sanitizeIdentity(invitation.identity),
    });
  }

  private async onAccepted(sessionId: string): Promise<void> {
    if (!isCurrentSession(this.state, sessionId)) {
      return;
    }
    if (canDispatchCall(this.state, { type: "accepted", sessionId })) {
      this.dispatch({ type: "accepted", sessionId });
    }
  }

  private async onRemoteStream(sessionId: string, stream: MediaStream): Promise<void> {
    if (!isCurrentSession(this.state, sessionId)) {
      return;
    }
    const result = await this.media.attachRemote(stream, this.audioElement);
    this.audioBlocked = result === "blocked";
    this.notify();
  }

  private async onRemoteEnded(sessionId: string): Promise<void> {
    if (!isCurrentSession(this.state, sessionId) && this.state.status !== "idle") {
      return;
    }
    if (this.state.status === "idle") {
      return;
    }
    this.finish(sessionId, "remote");
  }

  private finish(sessionId: string, reason: string): void {
    if (canDispatchCall(this.state, { type: "terminate", sessionId })) {
      this.dispatch({ type: "terminate", sessionId });
    }
    this.media.detachRemote(this.audioElement);
    this.media.release();
    this.audioBlocked = false;
    this.cancelOutgoing = null;
    this.incoming = null;
    if (canDispatchCall(this.state, { type: "ended", sessionId, reason })) {
      this.dispatch({ type: "ended", sessionId, reason });
    }
    if (canDispatchCall(this.state, { type: "reset" })) {
      this.dispatch({ type: "reset" });
    }
  }

  private dispatch(event: Parameters<typeof reduceCall>[1]): void {
    this.state = reduceCall(this.state, event);
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

export function sanitizeIdentity(identity: SafeIdentity): SafeIdentity {
  return {
    // eslint-disable-next-line no-control-regex -- strip C0 controls from untrusted names
    displayName: identity.displayName.replace(/[\u0000-\u001F\u007F]/g, ""),
    uri: identity.uri,
  };
}

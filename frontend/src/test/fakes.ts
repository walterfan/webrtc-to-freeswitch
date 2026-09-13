import type { MediaPort } from "../ports/media";
import type {
  IncomingHandle,
  OutgoingHandle,
  SessionId,
  SipConnectInput,
  SipPort,
  SipTraceMessage,
  SipTransportEvents,
} from "../ports/sip";
import type { UriBuilder } from "../services/destination";

export const fakeUri: UriBuilder = {
  parse(value) {
    return value.startsWith("sip:") && !value.includes(" ") ? { toString: () => value } : undefined;
  },
  fromUserHost(user, host) {
    return { toString: () => `sip:${user}@${host}` };
  },
};

export class FakeSipPort implements SipPort {
  events: SipTransportEvents = {};
  connected: SipConnectInput | null = null;
  passwordCleared = false;
  registerCalls = 0;
  disconnectCalls = 0;
  rejectedBusy: IncomingHandle[] = [];
  dtmf: { sessionId: string; digit: string; method: "rtp" | "info" }[] = [];
  telephoneEvent = true;
  failRegister: Error | null = null;
  failConnect: Error | null = null;
  logs: string[] = [];
  fetchCalls: string[] = [];
  storage = new Map<string, string>();
  lastInvite: string | null = null;

  bind(events: SipTransportEvents): void {
    this.events = events;
  }

  hasStoredPassword(): boolean {
    return Boolean(this.connected?.password) && !this.passwordCleared;
  }

  async connect(input: SipConnectInput): Promise<void> {
    if (this.failConnect) {
      throw this.failConnect;
    }
    this.connected = input;
    this.passwordCleared = false;
  }

  async register(): Promise<void> {
    this.registerCalls += 1;
    if (this.failRegister) {
      throw this.failRegister;
    }
    this.events.onRegistered?.();
  }

  async unregister(): Promise<void> {
    this.events.onUnregistered?.();
  }

  async disconnect(): Promise<void> {
    this.disconnectCalls += 1;
    this.passwordCleared = true;
    if (this.connected) {
      this.connected = { ...this.connected, password: "" };
    }
  }

  async invite(targetUri: string): Promise<OutgoingHandle> {
    this.lastInvite = targetUri;
    const sessionId = `out-${targetUri}`;
    return {
      sessionId,
      cancel: async () => undefined,
    };
  }

  async sendDtmf(sessionId: SessionId, digit: string, preferredMethod: "rtp" | "info") {
    const method = preferredMethod === "rtp" && this.telephoneEvent ? "rtp" : "info";
    this.dtmf.push({ sessionId, digit, method });
    return method;
  }

  hasTelephoneEvent(): boolean {
    return this.telephoneEvent;
  }

  emitIncoming(identity = { displayName: "Alice", uri: "sip:1002@localhost" }): IncomingHandle {
    const handle: IncomingHandle = {
      sessionId: "in-1",
      identity,
      accept: async () => undefined,
      reject: async () => {
        this.rejectedBusy.push(handle);
      },
    };
    this.events.onInvitation?.(handle);
    return handle;
  }

  emitTransportLost(): void {
    this.events.onTransportDisconnected?.();
  }

  emitSipMessage(
    partial: Pick<SipTraceMessage, "raw" | "direction"> & Partial<SipTraceMessage>,
  ): void {
    const message: SipTraceMessage = {
      id: partial.id ?? `msg-${Date.now()}`,
      direction: partial.direction,
      at: partial.at ?? Date.now(),
      raw: partial.raw,
    };
    this.events.onSipMessage?.(message);
  }
}

export class FakeMedia implements MediaPort {
  acquires = 0;
  stops = 0;
  muted = false;
  released = false;
  lastConstraints: MediaStreamConstraints | null = null;
  playBlocked = false;
  detached = false;
  stream = { id: "local" } as MediaStream;

  acquireCount(): number {
    return this.acquires;
  }

  stopCount(): number {
    return this.stops;
  }

  localStream(): MediaStream | null {
    return this.released ? null : this.stream;
  }

  async acquireMicrophone(): Promise<MediaStream> {
    this.acquires += 1;
    this.lastConstraints = { audio: true, video: false };
    this.released = false;
    this.stops = 0;
    return this.stream;
  }

  async attachRemote(_stream: MediaStream, audioElement: HTMLAudioElement) {
    audioElement.srcObject = _stream;
    return this.playBlocked ? "blocked" : "playing";
  }

  async enableAudio(audioElement: HTMLAudioElement): Promise<void> {
    void audioElement;
    this.playBlocked = false;
  }

  setMuted(muted: boolean): boolean {
    this.muted = muted;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  detachRemote(audioElement: HTMLAudioElement): void {
    this.detached = true;
    audioElement.srcObject = null;
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.stops += 1;
    this.muted = false;
  }
}

export function audioElement(): HTMLAudioElement {
  return {
    srcObject: null,
    play: async () => undefined,
    pause: () => undefined,
  } as unknown as HTMLAudioElement;
}

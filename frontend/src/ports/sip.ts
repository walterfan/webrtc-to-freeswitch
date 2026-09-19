import type { AppError, MediaMode, SafeIdentity } from "../types/domain";

export type SipMessageDirection = "send" | "receive";

export type SipTraceMessage = {
  id: string;
  direction: SipMessageDirection;
  at: number;
  raw: string;
};

export type SessionId = string;

export type IncomingHandle = {
  sessionId: SessionId;
  identity: SafeIdentity;
  accept(): Promise<void>;
  reject(): Promise<void>;
};

export type OutgoingHandle = {
  sessionId: SessionId;
  cancel(): Promise<void>;
};

export type ActiveHandle = {
  sessionId: SessionId;
  hangup(): Promise<void>;
};

export type SipTransportEvents = {
  onRegistered?: () => void;
  onUnregistered?: () => void;
  onTransportDisconnected?: () => void;
  onInvitation?: (invitation: IncomingHandle) => void;
  onOutgoingProgress?: (sessionId: SessionId) => void;
  onOutgoingAccepted?: (sessionId: SessionId) => void;
  onLocalStream?: (sessionId: SessionId, stream: MediaStream) => void;
  onRemoteStream?: (sessionId: SessionId, stream: MediaStream) => void;
  onSessionTerminated?: (sessionId: SessionId, error?: AppError) => void;
  onSipMessage?: (message: SipTraceMessage) => void;
};

export function createSipEventHub(): SipTransportEvents & {
  add(listener: SipTransportEvents): void;
} {
  const listeners = new Set<SipTransportEvents>();
  const emit = <K extends keyof SipTransportEvents>(
    key: K,
    ...args: Parameters<NonNullable<SipTransportEvents[K]>>
  ) => {
    for (const listener of listeners) {
      const handler = listener[key];
      if (handler) {
        (handler as (...handlerArgs: typeof args) => void)(...args);
      }
    }
  };
  return {
    add: (listener) => {
      listeners.add(listener);
    },
    onRegistered: () => emit("onRegistered"),
    onUnregistered: () => emit("onUnregistered"),
    onTransportDisconnected: () => emit("onTransportDisconnected"),
    onInvitation: (invitation) => emit("onInvitation", invitation),
    onOutgoingProgress: (sessionId) => emit("onOutgoingProgress", sessionId),
    onOutgoingAccepted: (sessionId) => emit("onOutgoingAccepted", sessionId),
    onLocalStream: (sessionId, stream) => emit("onLocalStream", sessionId, stream),
    onRemoteStream: (sessionId, stream) => emit("onRemoteStream", sessionId, stream),
    onSessionTerminated: (sessionId, error) => emit("onSessionTerminated", sessionId, error),
    onSipMessage: (message) => emit("onSipMessage", message),
  };
}

export type SipConnectInput = {
  username: string;
  password: string;
  domain: string;
  webSocketUrl: string;
  iceServers: RTCIceServer[];
};

export type SipPort = {
  connect(input: SipConnectInput): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  disconnect(): Promise<void>;
  invite(targetUri: string, mediaMode: MediaMode): Promise<OutgoingHandle>;
  sendDtmf(
    sessionId: SessionId,
    digit: string,
    preferredMethod: "rtp" | "info",
  ): Promise<"rtp" | "info">;
  hasTelephoneEvent(sessionId: SessionId): boolean;
  bind(events: SipTransportEvents): void;
  hasStoredPassword(): boolean;
};

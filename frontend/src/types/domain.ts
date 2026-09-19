export type EnvironmentName = "development" | "production";
export type DtmfMethod = "rtp" | "info";

export type IceServer = {
  urls: string[];
  username?: string;
  credential?: string;
};

export type ServerRuntimeConfig = {
  environment: EnvironmentName;
  /** Optional defaults from APP_SIP_*; empty when unset. */
  sipWebSocketUrl: string;
  sipDomain: string;
  iceServers: IceServer[];
  registration: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  dtmf: {
    preferredMethod: DtmfMethod;
  };
};

/** Browser session config: server knobs plus the SIP endpoint used to connect. */
export type RuntimeConfig = ServerRuntimeConfig;

export type ConfigStatus = "loading" | "ready" | "failed";

export type RegistrationStatus =
  "disconnected" | "connecting" | "registering" | "registered" | "reconnecting" | "failed";

export type CallStatus =
  | "idle"
  | "incoming-ringing"
  | "outgoing-dialing"
  | "outgoing-ringing"
  | "active"
  | "terminating"
  | "ended";

export type ErrorCategory =
  | "configuration"
  | "authentication"
  | "certificate"
  | "transport"
  | "busy"
  | "declined"
  | "not-found"
  | "unavailable"
  | "permission"
  | "missing-device"
  | "media"
  | "validation"
  | "unsupported"
  | "generic";

export type AppError = {
  category: ErrorCategory;
  message: string;
};

export type SafeIdentity = {
  displayName: string;
  uri: string;
};

export type CallDirection = "incoming" | "outgoing";
export type MediaMode = "audio" | "video";
export type VideoStatus = "not-applicable" | "waiting" | "available" | "unavailable";

export function mediaConstraintsFor(mode: MediaMode): MediaStreamConstraints {
  return { audio: true, video: mode === "video" };
}

import type {
  AppError,
  CallDirection,
  CallStatus,
  MediaMode,
  SafeIdentity,
  VideoStatus,
} from "../types/domain";

export type CallState = {
  status: CallStatus;
  sessionId: string | null;
  direction: CallDirection | null;
  remote: SafeIdentity | null;
  error: AppError | null;
  endReason: string | null;
  mediaMode: MediaMode | null;
  localVideoStatus: VideoStatus;
  remoteVideoStatus: VideoStatus;
};

export type CallEvent =
  | { type: "outgoing-start"; sessionId: string; remote: SafeIdentity; mediaMode: MediaMode }
  | { type: "outgoing-ringing"; sessionId: string }
  | { type: "incoming"; sessionId: string; remote: SafeIdentity }
  | { type: "answer"; sessionId: string }
  | { type: "accepted"; sessionId: string }
  | { type: "terminate"; sessionId: string }
  | { type: "ended"; sessionId: string; reason?: string; error?: AppError }
  | { type: "local-video"; sessionId: string; status: VideoStatus }
  | { type: "remote-video"; sessionId: string; status: VideoStatus }
  | { type: "reset" };

const LEGAL: Record<CallStatus, ReadonlySet<CallEvent["type"]>> = {
  idle: new Set(["outgoing-start", "incoming"]),
  "outgoing-dialing": new Set([
    "outgoing-ringing",
    "accepted",
    "terminate",
    "ended",
    "local-video",
    "remote-video",
  ]),
  "outgoing-ringing": new Set(["accepted", "terminate", "ended", "local-video", "remote-video"]),
  "incoming-ringing": new Set(["answer", "terminate", "ended"]),
  active: new Set(["terminate", "ended", "local-video", "remote-video"]),
  terminating: new Set(["ended"]),
  ended: new Set(["reset"]),
};

export function initialCallState(): CallState {
  return {
    status: "idle",
    sessionId: null,
    direction: null,
    remote: null,
    error: null,
    endReason: null,
    mediaMode: null,
    localVideoStatus: "not-applicable",
    remoteVideoStatus: "not-applicable",
  };
}

export function canDispatchCall(state: CallState, event: CallEvent): boolean {
  return LEGAL[state.status].has(event.type);
}

export function isCurrentSession(state: CallState, sessionId: string): boolean {
  return state.sessionId === sessionId;
}

export function reduceCall(state: CallState, event: CallEvent): CallState {
  if (!canDispatchCall(state, event)) {
    throw new Error(`illegal call transition: ${state.status} + ${event.type}`);
  }
  switch (event.type) {
    case "outgoing-start":
      return {
        status: "outgoing-dialing",
        sessionId: event.sessionId,
        direction: "outgoing",
        remote: event.remote,
        error: null,
        endReason: null,
        mediaMode: event.mediaMode,
        localVideoStatus: event.mediaMode === "video" ? "waiting" : "not-applicable",
        remoteVideoStatus: event.mediaMode === "video" ? "waiting" : "not-applicable",
      };
    case "outgoing-ringing":
      if (!isCurrentSession(state, event.sessionId)) {
        return state;
      }
      return { ...state, status: "outgoing-ringing" };
    case "incoming":
      return {
        status: "incoming-ringing",
        sessionId: event.sessionId,
        direction: "incoming",
        remote: event.remote,
        error: null,
        endReason: null,
        mediaMode: "audio",
        localVideoStatus: "not-applicable",
        remoteVideoStatus: "not-applicable",
      };
    case "answer":
    case "accepted":
      if (!isCurrentSession(state, event.sessionId)) {
        return state;
      }
      return { ...state, status: "active", error: null };
    case "terminate":
      if (!isCurrentSession(state, event.sessionId)) {
        return state;
      }
      return { ...state, status: "terminating" };
    case "ended":
      if (state.sessionId && !isCurrentSession(state, event.sessionId)) {
        return state;
      }
      return {
        ...state,
        status: "ended",
        error: event.error ?? null,
        endReason: event.reason ?? null,
      };
    case "local-video":
      if (!isCurrentSession(state, event.sessionId) || state.mediaMode !== "video") {
        return state;
      }
      return { ...state, localVideoStatus: event.status };
    case "remote-video":
      if (!isCurrentSession(state, event.sessionId) || state.mediaMode !== "video") {
        return state;
      }
      return { ...state, remoteVideoStatus: event.status };
    case "reset":
      return initialCallState();
  }
}

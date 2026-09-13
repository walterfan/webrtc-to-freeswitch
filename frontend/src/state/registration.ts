import type { AppError, RegistrationStatus } from "../types/domain";

export type RegistrationState = {
  status: RegistrationStatus;
  error: AppError | null;
  retryAttempt: number;
};

export type RegistrationEvent =
  | { type: "connect" }
  | { type: "registering" }
  | { type: "registered" }
  | { type: "transport-lost" }
  | { type: "auth-failed"; error: AppError }
  | { type: "certificate-failed"; error: AppError }
  | { type: "retry" }
  | { type: "retry-exhausted"; error: AppError }
  | { type: "disconnect" }
  | { type: "failed"; error: AppError };

const LEGAL: Record<RegistrationStatus, ReadonlySet<RegistrationEvent["type"]>> = {
  disconnected: new Set(["connect", "failed"]),
  connecting: new Set(["registering", "auth-failed", "certificate-failed", "failed", "disconnect"]),
  registering: new Set(["registered", "auth-failed", "certificate-failed", "failed", "disconnect"]),
  registered: new Set(["transport-lost", "disconnect"]),
  reconnecting: new Set(["retry", "registered", "retry-exhausted", "disconnect", "failed"]),
  failed: new Set(["connect", "disconnect"]),
};

export function initialRegistrationState(): RegistrationState {
  return { status: "disconnected", error: null, retryAttempt: 0 };
}

export function canDispatch(state: RegistrationState, event: RegistrationEvent): boolean {
  return LEGAL[state.status].has(event.type);
}

export function reduceRegistration(
  state: RegistrationState,
  event: RegistrationEvent,
): RegistrationState {
  if (!canDispatch(state, event)) {
    throw new Error(`illegal registration transition: ${state.status} + ${event.type}`);
  }
  switch (event.type) {
    case "connect":
      return { status: "connecting", error: null, retryAttempt: 0 };
    case "registering":
      return { ...state, status: "registering", error: null };
    case "registered":
      return { status: "registered", error: null, retryAttempt: 0 };
    case "transport-lost":
      return { ...state, status: "reconnecting" };
    case "retry":
      return { ...state, status: "reconnecting", retryAttempt: state.retryAttempt + 1 };
    case "auth-failed":
    case "certificate-failed":
    case "failed":
    case "retry-exhausted":
      return { status: "failed", error: event.error, retryAttempt: 0 };
    case "disconnect":
      return initialRegistrationState();
  }
}

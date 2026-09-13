import type { AppError, ErrorCategory } from "../types/domain";

const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  configuration: "Runtime configuration is unavailable.",
  authentication: "Registration was rejected. Check the SIP username and password.",
  certificate:
    "The secure signaling connection failed. Trust the server certificate and try again.",
  transport: "The signaling connection was lost.",
  busy: "The destination is busy.",
  declined: "The destination declined the call.",
  "not-found": "The destination was not found.",
  unavailable: "The destination is temporarily unavailable.",
  permission: "Microphone permission is required to place or answer a call.",
  "missing-device": "No microphone is available.",
  media: "Audio could not be started.",
  validation: "The destination is not valid.",
  unsupported: "This browser or page context does not support WebRTC calling.",
  generic: "The request failed. Try again.",
};

export function appError(category: ErrorCategory, message?: string): AppError {
  return { category, message: message ?? CATEGORY_MESSAGES[category] };
}

export function categoryFromSipStatus(status: number): ErrorCategory {
  if (status === 401 || status === 403 || status === 407) {
    return "authentication";
  }
  if (status === 486 || status === 600) {
    return "busy";
  }
  if (status === 603) {
    return "declined";
  }
  if (status === 404) {
    return "not-found";
  }
  if (status === 480 || status === 408 || status === 503) {
    return "unavailable";
  }
  return "generic";
}

export function categoryFromMediaError(error: unknown): ErrorCategory {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "permission";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "missing-device";
  }
  return "media";
}

export function categoryFromTransportError(error: unknown): ErrorCategory {
  const text = error instanceof Error ? error.message : String(error ?? "");
  if (/cert|tls|ssl|untrusted/i.test(text)) {
    return "certificate";
  }
  if (/auth|401|403|407/i.test(text)) {
    return "authentication";
  }
  return "transport";
}

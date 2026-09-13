import type { EnvironmentName } from "../types/domain";
import { appError } from "./errors";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.(?!-)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

function isLoopbackHost(host: string): boolean {
  const cleaned = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (LOOPBACK.has(cleaned)) {
    return true;
  }
  // IPv4 loopback only beyond the named set (avoid pulling Node net modules into the browser).
  return cleaned.startsWith("127.");
}

export function isValidSipDomain(value: string): boolean {
  if (!value || /[\s!/\\]/.test(value)) {
    return false;
  }
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value) || value.includes(":")) {
    return true;
  }
  return HOSTNAME_RE.test(value);
}

export function validateSipEndpoint(
  sipWebSocketUrl: string,
  sipDomain: string,
  environment: EnvironmentName,
): void {
  const domain = sipDomain.trim();
  const urlText = sipWebSocketUrl.trim();
  if (!isValidSipDomain(domain)) {
    throw appError("validation", "SIP domain must be a valid host or IP address.");
  }
  let parsed: URL;
  try {
    parsed = new URL(urlText);
  } catch {
    throw appError("validation", "SIP WebSocket URL must be a valid ws or wss URL.");
  }
  if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
    throw appError("validation", "SIP WebSocket URL must use ws or wss.");
  }
  if (!parsed.hostname) {
    throw appError("validation", "SIP WebSocket URL must include a host.");
  }
  if (
    parsed.protocol === "ws:" &&
    (environment !== "development" || !isLoopbackHost(parsed.hostname))
  ) {
    throw appError(
      "validation",
      "Plain ws:// is only allowed for loopback hosts in development.",
    );
  }
}

export function mergeSessionConfig(
  server: import("../types/domain").ServerRuntimeConfig,
  sipWebSocketUrl: string,
  sipDomain: string,
): import("../types/domain").RuntimeConfig {
  validateSipEndpoint(sipWebSocketUrl, sipDomain, server.environment);
  return {
    ...server,
    sipWebSocketUrl: sipWebSocketUrl.trim(),
    sipDomain: sipDomain.trim(),
  };
}

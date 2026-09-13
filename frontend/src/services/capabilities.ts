export type CapabilityResult =
  { ok: true } | { ok: false; reason: "missing-webrtc" | "insecure-context" };

export type CapabilityEnv = {
  isSecureContext: boolean;
  hostname: string;
  hasRtcPeerConnection: boolean;
  hasGetUserMedia: boolean;
};

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function inspectCapabilities(env: CapabilityEnv): CapabilityResult {
  if (!env.hasRtcPeerConnection || !env.hasGetUserMedia) {
    return { ok: false, reason: "missing-webrtc" };
  }
  if (env.isSecureContext || LOOPBACK.has(env.hostname.toLowerCase())) {
    return { ok: true };
  }
  return { ok: false, reason: "insecure-context" };
}

export function browserCapabilityEnv(): CapabilityEnv {
  return {
    isSecureContext: window.isSecureContext,
    hostname: window.location.hostname,
    hasRtcPeerConnection: typeof RTCPeerConnection === "function",
    hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
  };
}

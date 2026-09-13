import { describe, expect, it } from "vitest";
import { inspectCapabilities } from "./capabilities";

describe("inspectCapabilities", () => {
  it("rejects missing WebRTC APIs", () => {
    expect(
      inspectCapabilities({
        isSecureContext: true,
        hostname: "app.example",
        hasRtcPeerConnection: false,
        hasGetUserMedia: true,
      }),
    ).toEqual({ ok: false, reason: "missing-webrtc" });
  });

  it("rejects an insecure non-loopback deployment", () => {
    expect(
      inspectCapabilities({
        isSecureContext: false,
        hostname: "app.example",
        hasRtcPeerConnection: true,
        hasGetUserMedia: true,
      }),
    ).toEqual({ ok: false, reason: "insecure-context" });
  });

  it("allows loopback development without a secure context", () => {
    expect(
      inspectCapabilities({
        isSecureContext: false,
        hostname: "127.0.0.1",
        hasRtcPeerConnection: true,
        hasGetUserMedia: true,
      }),
    ).toEqual({ ok: true });
  });
});

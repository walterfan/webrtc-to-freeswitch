import { describe, expect, it } from "vitest";
import { mergeSessionConfig, validateSipEndpoint } from "./sipEndpoint";
import type { ServerRuntimeConfig } from "../types/domain";

const server: ServerRuntimeConfig = {
  environment: "development",
  iceServers: [],
  registration: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 },
  dtmf: { preferredMethod: "rtp" },
};

describe("validateSipEndpoint", () => {
  it("accepts loopback ws in development", () => {
    expect(() =>
      validateSipEndpoint("ws://127.0.0.1:7443", "localhost", "development"),
    ).not.toThrow();
  });

  it("rejects plain ws in production", () => {
    expect(() =>
      validateSipEndpoint("ws://127.0.0.1:7443", "localhost", "production"),
    ).toThrow(/ws:\/\//);
  });

  it("rejects an invalid domain", () => {
    expect(() =>
      validateSipEndpoint("wss://fs.example:7443", "not a host!!", "production"),
    ).toThrow(/domain/);
  });
});

describe("mergeSessionConfig", () => {
  it("merges user-entered endpoint fields", () => {
    const merged = mergeSessionConfig(server, "ws://127.0.0.1:7443", "localhost");
    expect(merged.sipWebSocketUrl).toBe("ws://127.0.0.1:7443");
    expect(merged.sipDomain).toBe("localhost");
    expect(merged.environment).toBe("development");
  });
});

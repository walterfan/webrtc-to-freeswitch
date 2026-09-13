import { describe, expect, it, vi } from "vitest";
import { createSipEventHub } from "../ports/sip";
import { FakeSipPort } from "../test/fakes";
import type { RuntimeConfig } from "../types/domain";
import { appError } from "./errors";
import { RegistrationService, retryDelayMs } from "./registration";

const config: RuntimeConfig = {
  environment: "development",
  sipWebSocketUrl: "ws://127.0.0.1:7443",
  sipDomain: "localhost",
  iceServers: [],
  registration: { maxRetries: 3, baseDelayMs: 1000, maxDelayMs: 4000 },
  dtmf: { preferredMethod: "rtp" },
};

const capabilities = {
  isSecureContext: true,
  hostname: "localhost",
  hasRtcPeerConnection: true,
  hasGetUserMedia: true,
};

function waits() {
  const calls: number[] = [];
  return {
    calls,
    clock: {
      random: () => 1,
      wait: async (ms: number, signal: AbortSignal) => {
        calls.push(ms);
        if (signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
      },
    },
  };
}

describe("RegistrationService", () => {
  it("recovers after transient transport loss within maxRetries", async () => {
    const sip = new FakeSipPort();
    const { clock } = waits();
    const hub = createSipEventHub();
    sip.bind(hub);
    const service = new RegistrationService(sip, clock, capabilities);
    service.attach(hub);
    await service.connect({ username: "1001", password: "secret", config });
    expect(service.getState().status).toBe("registered");
    sip.failConnect = null;
    sip.emitTransportLost();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.getState().status).toBe("registered");
  });

  it("exhausts retries at maxRetries and does not retry authentication", async () => {
    const sip = new FakeSipPort();
    const { clock, calls } = waits();
    const hub = createSipEventHub();
    sip.bind(hub);
    const service = new RegistrationService(sip, clock, capabilities);
    service.attach(hub);
    sip.failRegister = appError("authentication");
    await service.connect({ username: "1001", password: "secret", config });
    expect(service.getState().status).toBe("failed");
    expect(service.getState().error?.category).toBe("authentication");
    sip.emitTransportLost();
    await Promise.resolve();
    expect(calls).toEqual([]);

    sip.failRegister = appError("transport");
    sip.failConnect = appError("transport");
    const recovering = new RegistrationService(sip, clock, capabilities);
    recovering.attach(hub);
    sip.failConnect = null;
    sip.failRegister = null;
    await recovering.connect({ username: "1001", password: "secret", config });
    sip.failConnect = appError("transport");
    sip.emitTransportLost();
    await vi.waitFor(() => expect(recovering.getState().status).toBe("failed"));
    expect(calls.length).toBe(3);
    expect(Math.max(...calls)).toBeLessThanOrEqual(4000);
  });

  it("cancels retry after user disconnect", async () => {
    const sip = new FakeSipPort();
    let release: (() => void) | undefined;
    const clock = {
      random: () => 1,
      wait: (ms: number, signal: AbortSignal) =>
        new Promise<void>((resolve, reject) => {
          release = resolve;
          signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    };
    const hub = createSipEventHub();
    sip.bind(hub);
    const service = new RegistrationService(sip, clock, capabilities);
    service.attach(hub);
    await service.connect({ username: "1001", password: "secret", config });
    sip.failConnect = appError("transport");
    sip.emitTransportLost();
    await Promise.resolve();
    await service.disconnect();
    release?.();
    await Promise.resolve();
    expect(service.getState().status).toBe("disconnected");
    expect(sip.hasStoredPassword()).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("stays within the designed bounds", () => {
    const policy = { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 };
    expect(retryDelayMs(1, policy, () => 1)).toBe(1000);
    expect(retryDelayMs(2, policy, () => 1)).toBe(2000);
    expect(retryDelayMs(5, policy, () => 1)).toBe(15000);
    expect(retryDelayMs(3, policy, () => 0)).toBe(0);
  });
});

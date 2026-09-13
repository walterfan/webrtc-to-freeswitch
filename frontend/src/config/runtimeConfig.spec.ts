import { describe, expect, it, vi } from "vitest";
import { RuntimeConfigClient } from "./runtimeConfig";
import type { ServerRuntimeConfig } from "../types/domain";

const validConfig: ServerRuntimeConfig = {
  environment: "development",
  sipWebSocketUrl: "",
  sipDomain: "",
  iceServers: [],
  registration: { maxRetries: 5, baseDelayMs: 1000, maxDelayMs: 15000 },
  dtmf: { preferredMethod: "rtp" },
};

describe("RuntimeConfigClient", () => {
  it("keeps SIP actions disabled until a valid config loads", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(validConfig), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    const client = new RuntimeConfigClient(fetcher);

    const failed = await client.load();
    expect(failed.status).toBe("failed");
    expect(client.sipActionsEnabled()).toBe(false);

    const ready = await client.retry();
    expect(ready.status).toBe("ready");
    expect(client.sipActionsEnabled()).toBe(true);
    expect(ready.config).toEqual(validConfig);
  });

  it("accepts optional sip endpoint defaults", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ...validConfig,
          sipWebSocketUrl: "ws://127.0.0.1:7443",
          sipDomain: "localhost",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new RuntimeConfigClient(fetcher);
    const ready = await client.load();
    expect(ready.status).toBe("ready");
    expect(ready.config?.sipWebSocketUrl).toBe("ws://127.0.0.1:7443");
    expect(ready.config?.sipDomain).toBe("localhost");
  });
});

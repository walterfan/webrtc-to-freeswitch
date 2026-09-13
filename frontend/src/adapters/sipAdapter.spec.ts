import { beforeEach, describe, expect, it, vi } from "vitest";

const uaStarts: unknown[] = [];
const createdAgents: Array<{
  transport: {
    send: (message: string) => Promise<void>;
    onMessage?: (message: string) => void;
  };
}> = [];

vi.mock("sip.js", () => {
  class URI {
    constructor(
      readonly scheme: string,
      readonly user: string,
      readonly host: string,
    ) {}
    toString(): string {
      return `${this.scheme}:${this.user}@${this.host}`;
    }
    static parse(value: string) {
      return { toString: () => value };
    }
  }
  class UserAgent {
    transport = {
      send: vi.fn(async () => undefined),
      onMessage: undefined as ((message: string) => void) | undefined,
    };
    constructor(public options: Record<string, unknown>) {
      uaStarts.push(options);
      createdAgents.push(this);
    }
    async start(): Promise<void> {
      this.transport.onMessage = () => undefined;
    }
    async stop(): Promise<void> {
      return undefined;
    }
  }
  class Registerer {
    stateChange = { addListener: () => undefined };
    constructor() {}
    async register(): Promise<void> {
      return undefined;
    }
    async unregister(): Promise<void> {
      return undefined;
    }
  }
  return {
    URI,
    UserAgent,
    Registerer,
    Invitation: class {},
    Inviter: class {},
    RegistererState: { Registered: "Registered", Unregistered: "Unregistered" },
    SessionState: {
      Establishing: "Establishing",
      Established: "Established",
      Terminated: "Terminated",
    },
  };
});

import { SipJsAdapter } from "./sipAdapter";

describe("SipJsAdapter credentials", () => {
  beforeEach(() => {
    uaStarts.length = 0;
    createdAgents.length = 0;
  });

  it("keeps the password in memory and never writes it to storage, logs, or fetch", async () => {
    const storage = {
      data: new Map<string, string>(),
      getItem(key: string) {
        return this.data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.data.set(key, value);
      },
    };
    const logs: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    const adapter = new SipJsAdapter({
      storage,
      fetchImpl,
      log: (message) => logs.push(message),
    });
    await adapter.connect({
      username: "1001",
      password: "SENTINEL_PW",
      domain: "localhost",
      webSocketUrl: "ws://127.0.0.1:7443",
      iceServers: [],
    });
    expect(adapter.hasStoredPassword()).toBe(true);
    expect(storage.data.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(logs.join("\n")).not.toContain("SENTINEL_PW");
    expect(JSON.stringify(uaStarts)).toContain("SENTINEL_PW");
    await adapter.disconnect();
    expect(adapter.hasStoredPassword()).toBe(false);
  });

  it("accepts an out-of-dialog NOTIFY with 200 and does not reject it", async () => {
    const logs: string[] = [];
    const adapter = new SipJsAdapter({
      log: (message) => logs.push(message),
    });
    await adapter.connect({
      username: "1002",
      password: "SENTINEL_PW",
      domain: "localhost",
      webSocketUrl: "ws://127.0.0.1:7443",
      iceServers: [],
    });
    const options = uaStarts.at(-1) as {
      delegate?: { onNotify?: (notification: { accept: () => void; reject: () => void }) => void };
    };
    const accept = vi.fn();
    const reject = vi.fn();
    expect(options.delegate?.onNotify).toEqual(expect.any(Function));
    options.delegate?.onNotify?.({ accept, reject });
    expect(accept).toHaveBeenCalledOnce();
    expect(reject).not.toHaveBeenCalled();
    expect(logs.join("\n")).not.toContain("SENTINEL_PW");
    expect(logs.join("\n")).not.toMatch(/Messages-Waiting|message-summary|NOTIFY/i);
    await adapter.disconnect();
  });

  it("emits send and receive SIP messages without logging raw protocol text", async () => {
    const logs: string[] = [];
    const captured: Array<{ direction: string; raw: string }> = [];
    const adapter = new SipJsAdapter({
      log: (message) => logs.push(message),
    });
    adapter.bind({
      onSipMessage: (message) => captured.push({ direction: message.direction, raw: message.raw }),
    });
    await adapter.connect({
      username: "1001",
      password: "SENTINEL_PW",
      domain: "localhost",
      webSocketUrl: "ws://127.0.0.1:7443",
      iceServers: [],
    });
    const outgoing =
      'REGISTER sip:localhost SIP/2.0\r\nAuthorization: Digest username="1001",response="SECRET"\r\n\r\n';
    const incoming = "SIP/2.0 401 Unauthorized\r\nCall-ID: abc\r\n\r\n";
    const agent = createdAgents.at(-1);
    expect(agent).toBeDefined();
    await agent?.transport.send(outgoing);
    agent?.transport.onMessage?.(incoming);
    expect(captured).toEqual([
      { direction: "send", raw: outgoing },
      { direction: "receive", raw: incoming },
    ]);
    expect(logs.join("\n")).not.toContain("SECRET");
    expect(logs.join("\n")).not.toContain("Authorization");
    expect(logs.join("\n")).not.toContain(outgoing);
    await agent?.transport.send("\r\n\r\n");
    agent?.transport.onMessage?.("\r\n");
    expect(captured).toHaveLength(2);
    await adapter.disconnect();
  });
});

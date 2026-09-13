import type { RuntimeConfig } from "../types/domain";
import type { SipPort } from "../ports/sip";
import { appError, categoryFromTransportError } from "./errors";
import { inspectCapabilities, type CapabilityEnv } from "./capabilities";
import {
  canDispatch,
  initialRegistrationState,
  reduceRegistration,
  type RegistrationState,
} from "../state/registration";

export type RegistrationPolicy = RuntimeConfig["registration"];

export type Clock = {
  wait(ms: number, signal: AbortSignal): Promise<void>;
  random(): number;
};

export function retryDelayMs(
  attempt: number,
  policy: RegistrationPolicy,
  random: () => number,
): number {
  const n = Math.max(1, attempt);
  const ceiling = Math.min(policy.baseDelayMs * 2 ** (n - 1), policy.maxDelayMs);
  return random() * ceiling;
}

export function defaultClock(): Clock {
  return {
    random: Math.random,
    wait(ms, signal) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, ms);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          },
          { once: true },
        );
      });
    },
  };
}

export class RegistrationService {
  private state = initialRegistrationState();
  private readonly listeners = new Set<(state: RegistrationState) => void>();
  private retryAbort: AbortController | null = null;
  private connecting = false;

  constructor(
    private readonly sip: SipPort,
    private readonly clock: Clock = defaultClock(),
    private readonly capabilities: CapabilityEnv | (() => CapabilityEnv),
  ) {}

  attach(hub: { add(listener: import("../ports/sip").SipTransportEvents): void }): void {
    hub.add({
      onRegistered: () => this.safeDispatch({ type: "registered" }),
      onTransportDisconnected: () => {
        void this.handleTransportLost();
      },
    });
  }

  getState(): RegistrationState {
    return this.state;
  }

  subscribe(listener: (state: RegistrationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  async connect(input: {
    username: string;
    password: string;
    config: RuntimeConfig;
  }): Promise<void> {
    if (
      this.connecting ||
      this.state.status === "connecting" ||
      this.state.status === "registering"
    ) {
      return;
    }
    const env = typeof this.capabilities === "function" ? this.capabilities() : this.capabilities;
    const capability = inspectCapabilities(env);
    if (!capability.ok) {
      this.dispatch({
        type: "failed",
        error: appError("unsupported"),
      });
      return;
    }
    this.cancelRetries();
    this.rememberConnect(input);
    this.dispatch({ type: "connect" });
    this.connecting = true;
    try {
      await this.sip.connect({
        username: input.username,
        password: input.password,
        domain: input.config.sipDomain,
        webSocketUrl: input.config.sipWebSocketUrl,
        iceServers: input.config.iceServers,
      });
      this.dispatch({ type: "registering" });
      await this.sip.register();
      this.safeDispatch({ type: "registered" });
    } catch (error) {
      const category =
        error && typeof error === "object" && "category" in error
          ? (error as { category: "authentication" | "certificate" | "generic" }).category
          : categoryFromTransportError(error);
      if (category === "authentication") {
        this.dispatch({ type: "auth-failed", error: appError("authentication") });
      } else if (category === "certificate") {
        this.dispatch({ type: "certificate-failed", error: appError("certificate") });
      } else if (canDispatch(this.state, { type: "failed", error: appError(category) })) {
        this.dispatch({ type: "failed", error: appError(category) });
      }
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.cancelRetries();
    if (this.lastConnect) {
      this.lastConnect = { ...this.lastConnect, password: "" };
    }
    if (canDispatch(this.state, { type: "disconnect" })) {
      this.dispatch({ type: "disconnect" });
    }
    await this.sip.disconnect();
  }

  async retryManually(input: {
    username: string;
    password: string;
    config: RuntimeConfig;
  }): Promise<void> {
    if (this.state.status !== "failed" && this.state.status !== "disconnected") {
      return;
    }
    await this.connect(input);
  }

  private async handleTransportLost(): Promise<void> {
    if (this.state.status !== "registered" && this.state.status !== "reconnecting") {
      return;
    }
    if (this.state.status === "registered") {
      this.dispatch({ type: "transport-lost" });
    }
    await this.recover();
  }

  private async recover(): Promise<void> {
    const policy = this.currentPolicy;
    if (!policy) {
      this.dispatch({ type: "retry-exhausted", error: appError("transport") });
      return;
    }
    this.retryAbort = new AbortController();
    const signal = this.retryAbort.signal;
    for (let attempt = 1; attempt <= policy.maxRetries; attempt += 1) {
      if (signal.aborted) {
        return;
      }
      this.dispatch({ type: "retry" });
      const delay = retryDelayMs(attempt, policy, () => this.clock.random());
      try {
        await this.clock.wait(delay, signal);
        await this.sip.connect(this.lastConnect!);
        await this.sip.register();
        this.safeDispatch({ type: "registered" });
        return;
      } catch {
        if (signal.aborted) {
          return;
        }
      }
    }
    this.dispatch({ type: "retry-exhausted", error: appError("transport") });
  }

  private lastConnect: {
    username: string;
    password: string;
    domain: string;
    webSocketUrl: string;
    iceServers: RTCIceServer[];
  } | null = null;
  private currentPolicy: RegistrationPolicy | null = null;

  rememberConnect(input: { username: string; password: string; config: RuntimeConfig }): void {
    this.currentPolicy = input.config.registration;
    this.lastConnect = {
      username: input.username,
      password: input.password,
      domain: input.config.sipDomain,
      webSocketUrl: input.config.sipWebSocketUrl,
      iceServers: input.config.iceServers,
    };
  }

  private cancelRetries(): void {
    this.retryAbort?.abort();
    this.retryAbort = null;
  }

  private safeDispatch(event: Parameters<typeof reduceRegistration>[1]): void {
    if (canDispatch(this.state, event)) {
      this.dispatch(event);
    }
  }

  private dispatch(event: Parameters<typeof reduceRegistration>[1]): void {
    this.state = reduceRegistration(this.state, event);
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

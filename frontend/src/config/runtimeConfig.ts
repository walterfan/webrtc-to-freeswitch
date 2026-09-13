import type { ConfigStatus, ServerRuntimeConfig } from "../types/domain";

const CONFIG_KEYS = [
  "environment",
  "sipWebSocketUrl",
  "sipDomain",
  "iceServers",
  "registration",
  "dtmf",
] as const;

export type RuntimeConfigState =
  | { status: "loading"; config: null; error: null; sipActionsEnabled: false }
  | { status: "ready"; config: ServerRuntimeConfig; error: null; sipActionsEnabled: true }
  | { status: "failed"; config: null; error: string; sipActionsEnabled: false };

export function initialConfigState(): RuntimeConfigState {
  return { status: "loading", config: null, error: null, sipActionsEnabled: false };
}

export function isRuntimeConfig(value: unknown): value is ServerRuntimeConfig {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    CONFIG_KEYS.every((key) => key in record) &&
    typeof record.sipWebSocketUrl === "string" &&
    typeof record.sipDomain === "string"
  );
}

export async function fetchRuntimeConfig(fetcher: typeof fetch = fetch): Promise<ServerRuntimeConfig> {
  const response = await fetcher("/api/config");
  if (!response.ok) {
    throw new Error("configuration");
  }
  const body: unknown = await response.json();
  if (!isRuntimeConfig(body)) {
    throw new Error("configuration");
  }
  return body;
}

export class RuntimeConfigClient {
  private state: RuntimeConfigState = initialConfigState();
  private readonly listeners = new Set<(state: RuntimeConfigState) => void>();

  constructor(private readonly fetcher: typeof fetch = fetch) {}

  getState(): RuntimeConfigState {
    return this.state;
  }

  subscribe(listener: (state: RuntimeConfigState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  sipActionsEnabled(): boolean {
    return this.state.sipActionsEnabled;
  }

  async load(): Promise<RuntimeConfigState> {
    this.setState(initialConfigState());
    try {
      const config = await fetchRuntimeConfig(this.fetcher);
      this.setState({
        status: "ready",
        config,
        error: null,
        sipActionsEnabled: true,
      });
    } catch {
      this.setState({
        status: "failed",
        config: null,
        error: "Unable to load runtime configuration. Retry to try again.",
        sipActionsEnabled: false,
      });
    }
    return this.state;
  }

  async retry(): Promise<RuntimeConfigState> {
    return this.load();
  }

  private setState(state: RuntimeConfigState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

export function configStatusOf(state: RuntimeConfigState): ConfigStatus {
  return state.status;
}

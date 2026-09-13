import type { SipTraceMessage } from "../ports/sip";

export const SIP_TRACE_LIMIT = 200;

export type { SipTraceMessage };
export type SipTraceOrder = "desc" | "asc";

export type SipTraceState = {
  messages: SipTraceMessage[];
  filter: string;
  order: SipTraceOrder;
};

export function startLine(raw: string): string {
  return raw.split(/\r?\n/, 1)[0] ?? "";
}

export function formatSipTraceMarkdown(
  messages: SipTraceMessage[],
  options: { exportedAt?: Date } = {},
): string {
  const exportedAt = (options.exportedAt ?? new Date()).toISOString();
  const sections = messages.map((message, index) => {
    const heading = startLine(message.raw) || "(empty)";
    const when = new Date(message.at).toISOString();
    const body = message.raw.replace(/\r\n/g, "\n");
    return [
      `## ${index + 1}. ${message.direction} — ${heading}`,
      "",
      `- Time: ${when}`,
      `- Direction: ${message.direction}`,
      "",
      "```sip",
      body,
      "```",
    ].join("\n");
  });
  return [
    "# SIP message export",
    "",
    `Exported: ${exportedAt}`,
    "Order: as currently displayed",
    `Count: ${messages.length}`,
    "",
    ...(sections.length > 0 ? sections : ["_No SIP messages._"]),
    "",
  ].join("\n");
}

export function messageMatchesFilter(raw: string, filter: string): boolean {
  const query = filter.trim();
  if (!query) {
    return true;
  }
  const colon = query.indexOf(":");
  if (colon === -1) {
    return raw.toLowerCase().includes(query.toLowerCase());
  }
  const header = query.slice(0, colon).trim().toLowerCase();
  const value = query
    .slice(colon + 1)
    .trim()
    .toLowerCase();
  const headerValue = readHeader(raw, header);
  return headerValue !== undefined && headerValue.toLowerCase().includes(value);
}

function readHeader(raw: string, headerName: string): string | undefined {
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    if (line === "") {
      return undefined;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    if (line.slice(0, colon).trim().toLowerCase() === headerName) {
      return line.slice(colon + 1).trim();
    }
  }
  return undefined;
}

export class SipTraceService {
  private readonly items: SipTraceMessage[] = [];
  private filter = "";
  private order: SipTraceOrder = "desc";
  private readonly listeners = new Set<(state: SipTraceState) => void>();

  subscribe(listener: (state: SipTraceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  attach(hub: {
    add(listener: { onSipMessage?: (message: SipTraceMessage) => void }): void;
  }): void {
    hub.add({
      onSipMessage: (message) => this.add(message),
    });
  }

  add(message: SipTraceMessage): void {
    this.items.push(message);
    if (this.items.length > SIP_TRACE_LIMIT) {
      this.items.splice(0, this.items.length - SIP_TRACE_LIMIT);
    }
    this.notify();
  }

  clear(): void {
    this.items.length = 0;
    this.notify();
  }

  setFilter(filter: string): void {
    this.filter = filter;
    this.notify();
  }

  setOrder(order: SipTraceOrder): void {
    this.order = order;
    this.notify();
  }

  getState(): SipTraceState {
    const filtered = this.items.filter((item) => messageMatchesFilter(item.raw, this.filter));
    const messages = [...filtered].sort((a, b) =>
      this.order === "desc" ? b.at - a.at : a.at - b.at,
    );
    return { messages, filter: this.filter, order: this.order };
  }

  private notify(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

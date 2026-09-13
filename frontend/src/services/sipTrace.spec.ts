import { describe, expect, it } from "vitest";
import {
  SIP_TRACE_LIMIT,
  SipTraceService,
  formatSipTraceMarkdown,
  type SipTraceMessage,
} from "./sipTrace";

function msg(
  partial: Partial<SipTraceMessage> & Pick<SipTraceMessage, "raw" | "at">,
): SipTraceMessage {
  return {
    id: partial.id ?? `id-${partial.at}`,
    direction: partial.direction ?? "send",
    at: partial.at,
    raw: partial.raw,
  };
}

describe("SipTraceService", () => {
  it("lists newest first by default and can toggle to oldest first", () => {
    const trace = new SipTraceService();
    trace.add(msg({ at: 1, raw: "REGISTER sip:a SIP/2.0" }));
    trace.add(msg({ at: 2, raw: "SIP/2.0 200 OK" }));
    expect(trace.getState().order).toBe("desc");
    expect(trace.getState().messages.map((item) => item.at)).toEqual([2, 1]);
    trace.setOrder("asc");
    expect(trace.getState().messages.map((item) => item.at)).toEqual([1, 2]);
  });

  it("filters by header name and value", () => {
    const trace = new SipTraceService();
    trace.add(
      msg({
        at: 1,
        raw: "REGISTER sip:a SIP/2.0\r\nCall-ID: 8295890a-aaaa\r\n\r\n",
      }),
    );
    trace.add(
      msg({
        at: 2,
        raw: "INVITE sip:b SIP/2.0\r\nCall-ID: other-id\r\n\r\n",
      }),
    );
    trace.setFilter("Call-ID: 8295890a");
    expect(trace.getState().messages).toHaveLength(1);
    expect(trace.getState().messages[0]?.raw).toContain("8295890a-aaaa");
    trace.setFilter("");
    expect(trace.getState().messages).toHaveLength(2);
  });

  it("keeps at most 200 messages, drops the oldest, and clear empties the list", () => {
    const trace = new SipTraceService();
    for (let i = 0; i < SIP_TRACE_LIMIT + 1; i += 1) {
      trace.add(msg({ at: i, raw: `SIP/2.0 200 OK\r\nCSeq: ${i} REGISTER\r\n\r\n` }));
    }
    const state = trace.getState();
    expect(state.messages).toHaveLength(SIP_TRACE_LIMIT);
    expect(state.messages.some((item) => item.at === 0)).toBe(false);
    expect(state.messages.some((item) => item.at === SIP_TRACE_LIMIT)).toBe(true);
    trace.clear();
    expect(trace.getState().messages).toHaveLength(0);
  });

  it("formats the visible display-order list as markdown", () => {
    const markdown = formatSipTraceMarkdown(
      [
        msg({
          id: "1",
          direction: "send",
          at: 1_700_000_000_000,
          raw: "REGISTER sip:a SIP/2.0\r\nCall-ID: one\r\n\r\n",
        }),
        msg({
          id: "2",
          direction: "receive",
          at: 1_700_000_000_100,
          raw: "SIP/2.0 401 Unauthorized\r\nCall-ID: one\r\n\r\n",
        }),
      ],
      { exportedAt: new Date(1_700_000_000_200) },
    );
    expect(markdown).toContain("# SIP message export");
    expect(markdown).toContain("Count: 2");
    expect(markdown.indexOf("REGISTER sip:a SIP/2.0")).toBeLessThan(
      markdown.indexOf("SIP/2.0 401 Unauthorized"),
    );
    expect(markdown).toContain("## 1. send — REGISTER sip:a SIP/2.0");
    expect(markdown).toContain("## 2. receive — SIP/2.0 401 Unauthorized");
    expect(markdown).toContain("```sip\nREGISTER sip:a SIP/2.0");
    expect(markdown).toContain("Call-ID: one");
  });
});

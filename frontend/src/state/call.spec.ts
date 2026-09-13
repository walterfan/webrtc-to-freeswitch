import { describe, expect, it } from "vitest";
import { appError } from "../services/errors";
import { canDispatchCall, initialCallState, reduceCall, type CallEvent } from "./call";

const remote = { displayName: "Alice", uri: "sip:1002@localhost" };

const ALL: CallEvent[] = [
  { type: "outgoing-start", sessionId: "a", remote },
  { type: "outgoing-ringing", sessionId: "a" },
  { type: "incoming", sessionId: "b", remote },
  { type: "answer", sessionId: "b" },
  { type: "accepted", sessionId: "a" },
  { type: "terminate", sessionId: "a" },
  { type: "ended", sessionId: "a", reason: "hangup" },
  { type: "reset" },
];

describe("call reducer", () => {
  it("accepts outgoing and incoming happy paths", () => {
    let outgoing = reduceCall(initialCallState(), {
      type: "outgoing-start",
      sessionId: "a",
      remote,
    });
    outgoing = reduceCall(outgoing, { type: "outgoing-ringing", sessionId: "a" });
    outgoing = reduceCall(outgoing, { type: "accepted", sessionId: "a" });
    expect(outgoing.status).toBe("active");

    let incoming = reduceCall(initialCallState(), {
      type: "incoming",
      sessionId: "b",
      remote,
    });
    incoming = reduceCall(incoming, { type: "answer", sessionId: "b" });
    expect(incoming.status).toBe("active");
  });

  it("ignores stale session events", () => {
    const state = reduceCall(initialCallState(), {
      type: "outgoing-start",
      sessionId: "a",
      remote,
    });
    expect(reduceCall(state, { type: "outgoing-ringing", sessionId: "stale" }).status).toBe(
      "outgoing-dialing",
    );
  });

  it("rejects illegal transitions", () => {
    const states = [
      initialCallState(),
      reduceCall(initialCallState(), { type: "outgoing-start", sessionId: "a", remote }),
    ];
    states.push(reduceCall(states[1], { type: "outgoing-ringing", sessionId: "a" }));
    states.push(reduceCall(states[2], { type: "accepted", sessionId: "a" }));
    states.push(reduceCall(states[3], { type: "terminate", sessionId: "a" }));
    states.push(reduceCall(states[4], { type: "ended", sessionId: "a" }));
    for (const state of states) {
      for (const event of ALL) {
        if (!canDispatchCall(state, event)) {
          expect(() => reduceCall(state, event)).toThrow(/illegal call/);
        }
      }
    }
  });

  it("records a user-safe end reason", () => {
    let state = reduceCall(initialCallState(), {
      type: "outgoing-start",
      sessionId: "a",
      remote,
    });
    state = reduceCall(state, {
      type: "ended",
      sessionId: "a",
      error: appError("busy"),
      reason: "busy",
    });
    expect(state.status).toBe("ended");
    expect(state.error?.category).toBe("busy");
  });
});

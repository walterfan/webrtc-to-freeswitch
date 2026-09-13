import { describe, expect, it } from "vitest";
import { appError } from "../services/errors";
import {
  canDispatch,
  initialRegistrationState,
  reduceRegistration,
  type RegistrationEvent,
} from "./registration";

const ALL: RegistrationEvent[] = [
  { type: "connect" },
  { type: "registering" },
  { type: "registered" },
  { type: "transport-lost" },
  { type: "retry" },
  { type: "auth-failed", error: appError("authentication") },
  { type: "certificate-failed", error: appError("certificate") },
  { type: "retry-exhausted", error: appError("transport") },
  { type: "failed", error: appError("generic") },
  { type: "disconnect" },
];

describe("registration reducer", () => {
  it("accepts the designed happy path", () => {
    let state = initialRegistrationState();
    state = reduceRegistration(state, { type: "connect" });
    expect(state.status).toBe("connecting");
    state = reduceRegistration(state, { type: "registering" });
    expect(state.status).toBe("registering");
    state = reduceRegistration(state, { type: "registered" });
    expect(state.status).toBe("registered");
  });

  it("rejects every illegal transition from each status", () => {
    const seeds = [
      initialRegistrationState(),
      reduceRegistration(initialRegistrationState(), { type: "connect" }),
    ];
    seeds.push(reduceRegistration(seeds[1], { type: "registering" }));
    seeds.push(reduceRegistration(seeds[2], { type: "registered" }));
    seeds.push(reduceRegistration(seeds[3], { type: "transport-lost" }));
    seeds.push(reduceRegistration(seeds[3], { type: "disconnect" }));
    const failed = reduceRegistration(seeds[1], {
      type: "auth-failed",
      error: appError("authentication"),
    });
    for (const state of [...seeds, failed]) {
      for (const event of ALL) {
        if (!canDispatch(state, event)) {
          expect(() => reduceRegistration(state, event)).toThrow(/illegal registration/);
        }
      }
    }
  });
});

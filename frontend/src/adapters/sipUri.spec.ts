import { describe, expect, it } from "vitest";
import { createSipUriBuilder } from "./sipAdapter";
import { normalizeDestination } from "../services/destination";

describe("createSipUriBuilder", () => {
  const uri = createSipUriBuilder();

  it("parses a canonical sip URI with an IPv4 host", () => {
    const parsed = uri.parse("sip:5000@192.0.2.10");
    expect(parsed?.toString()).toBe("sip:5000@192.0.2.10");
  });

  it("normalizes numeric extensions and canonical sip URIs", () => {
    expect(normalizeDestination("5000", "192.0.2.10", uri)).toBe("sip:5000@192.0.2.10");
    expect(normalizeDestination("sip:5000@192.0.2.10", "192.0.2.10", uri)).toBe(
      "sip:5000@192.0.2.10",
    );
  });

  it("rejects a malformed sip URI", () => {
    expect(uri.parse("sip:@")).toBeUndefined();
    expect(() => normalizeDestination("sip:@", "192.0.2.10", uri)).toThrow("validation");
  });
});

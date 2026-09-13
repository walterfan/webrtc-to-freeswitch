import { describe, expect, it } from "vitest";
import { categoryFromSipStatus } from "./errors";
import { normalizeDestination, type UriBuilder } from "./destination";

const uri: UriBuilder = {
  parse(value: string) {
    if (!value.startsWith("sip:") || value.includes(" ")) {
      return undefined;
    }
    return { toString: () => value };
  },
  fromUserHost(user: string, host: string) {
    return { toString: () => `sip:${user}@${host}` };
  },
};

describe("normalizeDestination", () => {
  it("resolves numeric extensions against the SIP domain", () => {
    expect(normalizeDestination("1002", "fs.example.com", uri)).toBe("sip:1002@fs.example.com");
  });

  it("accepts a canonical sip URI", () => {
    expect(normalizeDestination("sip:1002@fs.example.com", "fs.example.com", uri)).toBe(
      "sip:1002@fs.example.com",
    );
  });

  it("rejects control characters and malformed targets", () => {
    expect(() => normalizeDestination("1002\u0000", "fs.example.com", uri)).toThrow("validation");
    expect(() => normalizeDestination("sip:not valid", "fs.example.com", uri)).toThrow(
      "validation",
    );
    expect(() => normalizeDestination("<script>", "fs.example.com", uri)).toThrow("validation");
  });
});

describe("SIP failure categories", () => {
  it("maps protocol statuses to user-safe categories", () => {
    expect(categoryFromSipStatus(486)).toBe("busy");
    expect(categoryFromSipStatus(603)).toBe("declined");
    expect(categoryFromSipStatus(404)).toBe("not-found");
    expect(categoryFromSipStatus(480)).toBe("unavailable");
    expect(categoryFromSipStatus(401)).toBe("authentication");
    expect(categoryFromSipStatus(500)).toBe("generic");
  });
});

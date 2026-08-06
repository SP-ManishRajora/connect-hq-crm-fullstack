import { describe, it, expect } from "vitest";
import {
  generateCode, normaliseDestination, isValidDestination,
  OTP_LENGTH, OTP_MAX_ATTEMPTS,
} from "@/lib/housekeeping/otp";

// The passcode is the entire barrier between the review table and anyone with a
// phone, so the pure parts of it are worth pinning down: a predictable code, a
// destination that normalises two ways, or a validator that accepts junk would
// each quietly undo the verification.

describe("generateCode", () => {
  it("is always the declared length, including when the value is small", () => {
    // Leading zeros must survive — "000042" is a legitimate code, and trimming it
    // to "42" would both break comparison and shrink the search space.
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toHaveLength(OTP_LENGTH);
    }
  });

  it("is digits only", () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d+$/);
  });

  it("does not repeat itself in a short run", () => {
    // A constant or low-entropy generator would show up immediately here.
    const seen = new Set(Array.from({ length: 300 }, () => generateCode()));
    expect(seen.size).toBeGreaterThan(250);
  });
});

describe("normaliseDestination", () => {
  it("collapses the spellings of one mobile number to a single identity", () => {
    // Otherwise "+91 98765 43210" and "9876543210" rate-limit as two people,
    // which is exactly the gap a spammer would use.
    const forms = ["9876543210", "+91 98765 43210", "091-98765-43210", " 919876543210 "];
    const out = forms.map((f) => normaliseDestination(f, "SMS"));
    expect(new Set(out).size).toBe(1);
    expect(out[0]).toBe("9876543210");
  });

  it("lowercases email so case cannot split the rate limit", () => {
    expect(normaliseDestination("  Person@Example.COM ", "EMAIL")).toBe("person@example.com");
  });
});

describe("isValidDestination", () => {
  it("accepts a normalised Indian mobile", () => {
    expect(isValidDestination("9876543210", "SMS")).toBe(true);
    expect(isValidDestination("6012345678", "SMS")).toBe(true);
  });

  it("rejects numbers that are the wrong length or start below 6", () => {
    for (const bad of ["987654321", "98765432101", "1234567890", "5876543210", ""]) {
      expect(isValidDestination(bad, "SMS")).toBe(false);
    }
  });

  it("accepts an ordinary email and rejects malformed ones", () => {
    expect(isValidDestination("person@example.com", "EMAIL")).toBe(true);
    for (const bad of ["person@", "@example.com", "person@example", "no-at-sign", "a b@c.com"]) {
      expect(isValidDestination(bad, "EMAIL")).toBe(false);
    }
  });
});

describe("brute-force budget", () => {
  it("caps attempts far below the code space", () => {
    // 5 guesses against 10^6 codes. If this cap ever drifted upward toward the
    // code space, the passcode would stop being a barrier.
    expect(OTP_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
    expect(10 ** OTP_LENGTH / OTP_MAX_ATTEMPTS).toBeGreaterThan(100_000);
  });
});

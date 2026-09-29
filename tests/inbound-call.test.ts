import { describe, it, expect } from "vitest";
import {
  describeInboundCall,
  earnsLead,
  inboundCallSource,
  inboundFinalStatus,
  isInboundPayload,
  localDigits,
  ownNumbers,
  parseFrejunTime,
  pickTap,
  type TapCandidate,
} from "@/lib/inboundCall";

/*
 * Inbound calls decide three things quietly — which tap a call came from,
 * whether it was an ad call, and whether a stranger becomes a lead. A wrong
 * answer produces plausible-looking data rather than an error, so the rules
 * are pinned here.
 */

const ring = new Date("2026-09-29T10:00:00Z");
const tap = (id: string, secondsBeforeRing: number, number: string | null = "+916300907795"): TapCandidate => ({
  id,
  occurredAt: new Date(ring.getTime() - secondsBeforeRing * 1000),
  number,
  gclid: null,
});

describe("isInboundPayload", () => {
  it("reads FreJun's call_type", () => {
    expect(isInboundPayload({ call_type: "inbound" })).toBe(true);
    expect(isInboundPayload({ call_type: "Inbound" })).toBe(true);
    expect(isInboundPayload({ call_type: "outbound" })).toBe(false);
    expect(isInboundPayload({})).toBe(false);
  });
});

describe("parseFrejunTime", () => {
  it("scales Unix seconds instead of landing in 1970", () => {
    expect(parseFrejunTime(1790676000)?.toISOString()).toBe("2026-09-29T10:00:00.000Z");
    expect(parseFrejunTime("1790676000")?.toISOString()).toBe("2026-09-29T10:00:00.000Z");
  });

  it("accepts milliseconds and ISO strings", () => {
    expect(parseFrejunTime(1790676000000)?.toISOString()).toBe("2026-09-29T10:00:00.000Z");
    expect(parseFrejunTime("2026-09-29T10:00:00Z")?.toISOString()).toBe("2026-09-29T10:00:00.000Z");
  });

  it("returns null for anything unreadable", () => {
    expect(parseFrejunTime(null)).toBeNull();
    expect(parseFrejunTime("")).toBeNull();
    expect(parseFrejunTime("soon")).toBeNull();
  });
});

describe("pickTap", () => {
  it("matches the one tap shortly before the ring", () => {
    expect(pickTap([tap("a", 30)], ring)?.id).toBe("a");
  });

  it("refuses to guess between two taps", () => {
    expect(pickTap([tap("a", 30), tap("b", 90)], ring)).toBeNull();
  });

  it("ignores taps outside the window", () => {
    expect(pickTap([tap("old", 11 * 60)], ring)).toBeNull();
    expect(pickTap([tap("old", 11 * 60), tap("a", 20)], ring)?.id).toBe("a");
    expect(pickTap([tap("late", -5 * 60)], ring)).toBeNull();
  });
});

describe("inboundCallSource", () => {
  const own = ownNumbers({ SITE_PHONE_NUMBERS: "+91 63009 07795", FREJUN_VIRTUAL_NUMBER: "08045678901" });

  it("is GOOGLE_ADS when the tapped number was not ours", () => {
    expect(inboundCallSource(tap("a", 10, "+911140001234"), own)).toBe("GOOGLE_ADS");
  });

  it("is WEBSITE when our own number was tapped, in any format", () => {
    expect(inboundCallSource(tap("a", 10, "+916300907795"), own)).toBe("WEBSITE");
    expect(inboundCallSource(tap("a", 10, "+918045678901"), own)).toBe("WEBSITE");
    expect(inboundCallSource(tap("a", 10, null), own)).toBe("WEBSITE");
  });

  it("is DIRECT with no matched tap", () => {
    expect(inboundCallSource(null, own)).toBe("DIRECT");
  });
});

describe("inboundFinalStatus / earnsLead", () => {
  it("treats a completed call nobody answered as missed", () => {
    expect(inboundFinalStatus("COMPLETED", null, 0)).toBe("NO_ANSWER");
    expect(inboundFinalStatus("COMPLETED", ring, 40)).toBe("COMPLETED");
    expect(inboundFinalStatus("BUSY", null, 0)).toBe("BUSY");
  });

  it("only creates a lead for a real conversation", () => {
    expect(earnsLead("COMPLETED", 15)).toBe(true);
    expect(earnsLead("COMPLETED", 4)).toBe(false);
    expect(earnsLead("NO_ANSWER", 0)).toBe(false);
  });
});

describe("localDigits", () => {
  it("reduces any format to the last ten digits", () => {
    expect(localDigits("+91 98765 43210")).toBe("9876543210");
    expect(localDigits("09876543210")).toBe("9876543210");
    expect(localDigits("12345")).toBeNull();
  });
});

describe("describeInboundCall", () => {
  it("says where an ad call came from", () => {
    expect(
      describeInboundCall({
        status: "COMPLETED",
        durationSec: 125,
        recordingUrl: null,
        callSource: "GOOGLE_ADS",
        tapPath: "/noida.html",
        utmCampaign: "noida-search",
      }),
    ).toBe("Inbound call answered — 2m 5s\nFrom a Google Ads click (forwarding number) on /noida.html — campaign: noida-search");
  });

  it("flags a missed call for a call back", () => {
    expect(describeInboundCall({ status: "NO_ANSWER", durationSec: 0, recordingUrl: null, callSource: "DIRECT" })).toBe(
      "Missed inbound call — call back",
    );
  });
});

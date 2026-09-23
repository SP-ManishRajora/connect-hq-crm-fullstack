import { describe, it, expect } from "vitest";
import {
  hashForAds,
  toE164,
  formatAdsDateTime,
  buildConversionPayload,
  type AdsConfig,
} from "@/lib/analytics/ads";
import { buildFunnel, QUALIFIED_STAGES, WON_STAGES, type FunnelCounts } from "@/lib/analytics/funnel";
import { LEAD_STAGES, LEAD_LOST } from "@/lib/leadStatus";

/*
 * Offline conversions write to a live ad account, and a wrong value there is
 * not a cosmetic bug — it teaches Google's bidding the wrong lesson and costs
 * real money for weeks. These tests pin down the parts that would fail
 * silently: a hash that never matches, a timestamp read in the wrong timezone,
 * a value Google rejects.
 */

const cfg: AdsConfig = {
  customerId: "1234567890",
  loginCustomerId: "1234567890",
  developerToken: "dev",
  clientId: "cid",
  clientSecret: "secret",
  refreshToken: "refresh",
  conversionActionId: "987654",
};

describe("toE164", () => {
  it("normalises the same Indian subscriber written four ways", () => {
    // These must all produce one hash, or enhanced conversions silently never
    // match and the campaign looks like it underperforms.
    const want = "+916300907795";
    expect(toE164("+91 63009 07795")).toBe(want);
    expect(toE164("06300907795")).toBe(want);
    expect(toE164("6300907795")).toBe(want);
    expect(toE164("916300907795")).toBe(want);
  });

  it("keeps an explicit international number as given", () => {
    expect(toE164("+1 415 555 0123")).toBe("+14155550123");
  });

  it("refuses an ambiguous number rather than guessing", () => {
    // A wrong hash is worse than no hash: it never matches and looks like poor
    // performance rather than a data bug.
    expect(toE164("12345")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164(null)).toBeNull();
  });
});

describe("hashForAds", () => {
  it("lower-cases and trims before hashing, as Google requires", () => {
    const a = hashForAds("  Person@Example.COM ");
    const b = hashForAds("person@example.com");
    expect(a).toBe(b);
  });

  it("produces the reference SHA-256 digest for a known email", () => {
    // Pinned to the real digest. If the algorithm or the normalisation ever
    // changes, every upload silently stops matching Google's side and the only
    // symptom is campaigns that look like they stopped converting.
    expect(hashForAds("person@example.com")).toBe(
      "542d240129883c019e106e3b1b2d3f3cb3537c43c425364de8e951d5a3083345",
    );
  });

  it("produces the reference digest for a normalised phone number", () => {
    // The whole chain: "06300907795" → E.164 → SHA-256.
    expect(hashForAds(toE164("06300907795"))).toBe(
      "9fa6f890bac6a28d5d91669698d372bbd8faf69c0e4f8dbcd863ea914cb1ae5e",
    );
  });

  it("returns null for nothing, rather than hashing an empty string", () => {
    // Hashing "" produces a valid-looking digest that matches no one.
    expect(hashForAds("")).toBeNull();
    expect(hashForAds(null)).toBeNull();
    expect(hashForAds("   ")).toBeNull();
  });
});

describe("formatAdsDateTime", () => {
  it("emits the format the Ads API demands, with an explicit offset", () => {
    // An ISO string is rejected outright, and a naive timestamp is read in the
    // account's timezone — shifting every conversion by hours.
    const d = new Date("2026-09-23T06:30:00Z");
    expect(formatAdsDateTime(d, 330)).toBe("2026-09-23 12:00:00+05:30");
  });

  it("handles a negative offset", () => {
    const d = new Date("2026-09-23T12:00:00Z");
    expect(formatAdsDateTime(d, -300)).toBe("2026-09-23 07:00:00-05:00");
  });

  it("pads single digits so the string is fixed width", () => {
    const d = new Date("2026-01-05T03:04:05Z");
    expect(formatAdsDateTime(d, 0)).toBe("2026-01-05 03:04:05+00:00");
  });
});

describe("buildConversionPayload", () => {
  const when = new Date("2026-09-23T06:30:00Z");

  it("builds the conversion action resource name from the config", () => {
    const p = buildConversionPayload(cfg, { gclid: "G1", conversionDateTime: when, value: 5000 });
    expect(p.conversionAction).toBe("customers/1234567890/conversionActions/987654");
    expect(p.gclid).toBe("G1");
  });

  it("sends a value with a currency when there is one", () => {
    const p = buildConversionPayload(cfg, { gclid: "G1", conversionDateTime: when, value: 5000 });
    expect(p.conversionValue).toBe(5000);
    expect(p.currencyCode).toBe("INR");
  });

  it("omits the value entirely when it is zero or missing", () => {
    // Google rejects a zero value; sending none still records the conversion.
    for (const value of [0, null, -1]) {
      const p = buildConversionPayload(cfg, { gclid: "G1", conversionDateTime: when, value });
      expect(p.conversionValue).toBeUndefined();
      expect(p.currencyCode).toBeUndefined();
    }
  });

  it("hashes enhanced-conversion identifiers and never sends them in the clear", () => {
    const p = buildConversionPayload(cfg, {
      gclid: "G1",
      conversionDateTime: when,
      value: 1,
      email: "Person@Example.com",
      phone: "06300907795",
    });
    const ids = p.userIdentifiers as Record<string, string>[];
    expect(ids).toHaveLength(2);
    expect(p.userIdentifierSource).toBe("FIRST_PARTY");

    const serialised = JSON.stringify(p);
    expect(serialised).not.toContain("Person@Example.com");
    expect(serialised).not.toContain("person@example.com");
    expect(serialised).not.toContain("6300907795");
    expect(ids[0].hashedEmail).toMatch(/^[0-9a-f]{64}$/);
    expect(ids[1].hashedPhoneNumber).toMatch(/^[0-9a-f]{64}$/);
  });

  it("omits identifiers entirely when there are none to send", () => {
    const p = buildConversionPayload(cfg, { gclid: "G1", conversionDateTime: when, value: 1 });
    expect(p.userIdentifiers).toBeUndefined();
    expect(p.userIdentifierSource).toBeUndefined();
  });

  it("carries the order id, so a retry updates rather than duplicates", () => {
    const p = buildConversionPayload(cfg, {
      gclid: "G1", conversionDateTime: when, value: 1, orderId: "lead-123",
    });
    expect(p.orderId).toBe("lead-123");
  });
});

describe("funnel stage definitions", () => {
  it("covers every pipeline stage exactly once, with none missed", () => {
    // If a stage is added to leadStatus.ts and not classified here, leads in it
    // vanish from the funnel without any error. This is that alarm.
    const classified = new Set([...QUALIFIED_STAGES, ...WON_STAGES, "Lead"]);
    for (const stage of LEAD_STAGES) {
      expect(classified.has(stage), `stage "${stage}" is not classified in the funnel`).toBe(true);
    }
  });

  it("treats won stages as a subset of qualified", () => {
    // A customer is necessarily also qualified; if not, the funnel would show
    // more customers than qualified leads.
    for (const w of WON_STAGES) expect(QUALIFIED_STAGES).toContain(w);
  });

  it("never counts a lost lead as qualified or won", () => {
    expect(QUALIFIED_STAGES).not.toContain(LEAD_LOST);
    expect(WON_STAGES).not.toContain(LEAD_LOST);
  });

  it("does not count a brand-new lead as qualified", () => {
    expect(QUALIFIED_STAGES).not.toContain("Lead");
  });
});

describe("buildFunnel", () => {
  const counts: FunnelCounts = {
    websiteFormSubmits: 10, whatsappClicks: 5, phoneClicks: 7,
    callsFromAds: 3, callsFromWebsite: 2,
    crmLeads: 20, googleLeadFormLeads: 4, webFormLeads: 16,
    qualifiedLeads: 8, customers: 2, lostLeads: 5,
    leadsWithGclid: 12, leadsWithUtm: 15,
    wonValue: 250000, conversionsUploaded: 1, conversionsPending: 1,
  };

  it("sums the browser-side signals into one contact-attempts line", () => {
    const f = buildFunnel(counts);
    expect(f[0].value).toBe(22); // 10 + 5 + 7
    expect(f[0].approximate).toBe(true);
  });

  it("marks CRM stages as exact, not approximate", () => {
    const f = buildFunnel(counts);
    for (const s of f.filter((x) => x.key !== "contact_attempts")) {
      expect(s.approximate).toBe(false);
    }
  });

  it("never divides a CRM count by a browser count", () => {
    // Those are different populations — ad-blockers suppress one and not the
    // other — so a rate between them looks meaningful and is not.
    const f = buildFunnel(counts);
    expect(f.find((s) => s.key === "contact_attempts")?.rate).toBeNull();
    expect(f.find((s) => s.key === "crm_leads")?.rate).toBeNull();
  });

  it("computes rates only within the CRM", () => {
    const f = buildFunnel(counts);
    expect(f.find((s) => s.key === "qualified")?.rate).toBeCloseTo(8 / 20);
    expect(f.find((s) => s.key === "customers")?.rate).toBeCloseTo(2 / 8);
  });

  it("returns null rather than dividing by zero on an empty funnel", () => {
    const empty = { ...counts, crmLeads: 0, qualifiedLeads: 0, customers: 0 };
    const f = buildFunnel(empty);
    for (const s of f) expect(s.rate === null || Number.isFinite(s.rate)).toBe(true);
  });
});

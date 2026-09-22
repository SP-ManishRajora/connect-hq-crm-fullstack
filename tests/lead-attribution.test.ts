import { describe, it, expect } from "vitest";
import { attributionView } from "@/lib/leadAttribution";

/*
 * What the attribution panel shows for a lead.
 *
 * The behaviour worth pinning down is when the panel stays hidden: most leads
 * arrive organically and carry no attribution at all, and a section of dashes
 * on every one of them would push the notes and status controls down the page
 * for nothing.
 */
describe("attributionView", () => {
  it("hides the panel for an organic lead", () => {
    // What /api/leads/public writes when the website sends no attribution:
    // real NULLs, not empty strings.
    const v = attributionView({ gclid: null, utmSource: null, landingPage: null });
    expect(v.show).toBe(false);
    expect(v.paid).toBe(false);
    expect(v.rows).toEqual([]);
  });

  it("hides the panel for a lead created by hand in the CRM", () => {
    expect(attributionView({}).show).toBe(false);
    expect(attributionView(null).show).toBe(false);
    expect(attributionView(undefined).show).toBe(false);
  });

  it("treats whitespace-only values as absent", () => {
    // Leads imported from elsewhere are not guaranteed to use NULL.
    expect(attributionView({ utmSource: "   ", gclid: "  " }).show).toBe(false);
  });

  it("marks a lead paid when it carries a gclid", () => {
    const v = attributionView({ gclid: "Cj0KCQjw_EXAMPLE", utmSource: "google" });
    expect(v.paid).toBe(true);
    // Kept whole: finance needs it to upload the closed deal to Google.
    expect(v.gclid).toBe("Cj0KCQjw_EXAMPLE");
  });

  it("shows the panel for a gclid with no utm_* at all", () => {
    // Normal for Ads auto-tagging, which sets gclid alone.
    const v = attributionView({ gclid: "abc123" });
    expect(v.show).toBe(true);
    expect(v.paid).toBe(true);
    expect(v.rows).toEqual([]);
  });

  it("lists only the fields the lead actually has", () => {
    const v = attributionView({ utmSource: "google", utmCampaign: "coworking-delhi" });
    expect(v.rows).toEqual([
      { label: "Source", value: "google" },
      { label: "Campaign", value: "coworking-delhi" },
    ]);
  });

  it("does not mark a utm-tagged lead as paid without a gclid", () => {
    // A newsletter or partner link carries utm_* with no Google click behind it.
    const v = attributionView({ utmSource: "newsletter", utmMedium: "email" });
    expect(v.show).toBe(true);
    expect(v.paid).toBe(false);
    expect(v.gclid).toBeNull();
  });

  it("never lists the gclid as a row", () => {
    // It is ~100 opaque characters; it belongs in the badge tooltip.
    const v = attributionView({ gclid: "Cj0KCQjw", utmSource: "google" });
    expect(v.rows.map((r) => r.value)).not.toContain("Cj0KCQjw");
  });

  it("orders rows for reading: who sent them, then campaign, then where they landed", () => {
    const v = attributionView({
      referrer: "https://www.google.com/",
      utmCampaign: "coworking-delhi",
      utmSource: "google",
      landingPage: "https://connecthq.co.in/green-park.html",
      utmMedium: "cpc",
      utmTerm: "coworking green park",
      utmContent: "ad-b",
      websiteLeadId: "CHQ-1-A",
    });
    expect(v.rows.map((r) => r.label)).toEqual([
      "Source", "Medium", "Campaign", "Keyword", "Ad content",
      "Landed on", "Referrer", "Web ref",
    ]);
  });
});

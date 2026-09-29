import { describe, it, expect } from "vitest";
import { parseTapMeta, tapChannel, summariseTaps, tapAge, type Tap } from "@/lib/analytics/phoneTap";

/*
 * The Website Calls report groups taps by placement and channel. Both are
 * derived, and both fail quietly — a wrong guess just moves taps into another
 * bucket — so the rules are pinned here.
 */

describe("parseTapMeta", () => {
  it("reads the placement the current tracker sends", () => {
    expect(parseTapMeta('{"where":"btn sticky-call","place":"sticky_bar","number":"+916300907795"}')).toEqual({
      place: "sticky_bar",
      number: "+916300907795",
    });
  });

  it("maps rows from the older tracker by their link class", () => {
    expect(parseTapMeta('{"where":"btn sticky-call"}').place).toBe("sticky_bar");
    expect(parseTapMeta('{"where":"nav-phone"}').place).toBe("header");
    expect(parseTapMeta('{"where":"f-contact"}').place).toBe("footer");
    expect(parseTapMeta('{"where":"btn btn-glass"}').place).toBe("page_body");
  });

  it("does not throw on missing or broken meta", () => {
    expect(parseTapMeta(null).place).toBe("unknown");
    expect(parseTapMeta("{not json").place).toBe("unknown");
    expect(parseTapMeta('{"where":"unclassed"}').place).toBe("unknown");
  });

  it("buckets a placement it does not know as unknown", () => {
    expect(parseTapMeta('{"place":"<script>"}').place).toBe("unknown");
  });
});

describe("tapChannel", () => {
  it("puts a gclid ahead of everything", () => {
    expect(tapChannel({ gclid: "abc", utmSource: "newsletter" })).toBe("google_ads");
  });

  it("recognises paid mediums without a gclid", () => {
    expect(tapChannel({ utmSource: "facebook", utmMedium: "paid_social" })).toBe("paid");
    expect(tapChannel({ utmSource: "bing", utmMedium: "CPC" })).toBe("paid");
  });

  it("treats other tagged traffic as a campaign", () => {
    expect(tapChannel({ utmSource: "newsletter", utmMedium: "email" })).toBe("campaign");
  });

  it("classifies untagged traffic by the landing referrer", () => {
    expect(tapChannel({ landingReferrer: "https://www.google.com/" })).toBe("organic_search");
    expect(tapChannel({ landingReferrer: "https://l.facebook.com/l.php?u=x" })).toBe("social");
    expect(tapChannel({ landingReferrer: "https://t.co/abc" })).toBe("social");
    expect(tapChannel({ landingReferrer: "https://some-blog.in/post" })).toBe("referral");
  });

  it("treats our own site and a missing referrer as direct", () => {
    expect(tapChannel({ landingReferrer: "https://connecthq.co.in/contact.html" })).toBe("direct");
    expect(tapChannel({ landingReferrer: "https://www.connecthq.co.in/" })).toBe("direct");
    expect(tapChannel({ landingReferrer: null })).toBe("direct");
    expect(tapChannel({ landingReferrer: "not a url" })).toBe("direct");
  });
});

describe("summariseTaps", () => {
  const tap = (over: Partial<Tap>): Tap => ({
    id: Math.random().toString(36),
    occurredAt: new Date(),
    visitorId: "v1",
    path: "/",
    place: "header",
    channel: "direct",
    utmCampaign: null,
    leadId: null,
    ...over,
  });

  it("counts taps, distinct visitors, paid and logged", () => {
    const s = summariseTaps([
      tap({ visitorId: "a", channel: "google_ads", leadId: "L1" }),
      tap({ visitorId: "a", channel: "google_ads" }),
      tap({ visitorId: "b", channel: "paid" }),
      tap({ visitorId: "c" }),
    ]);
    expect(s).toMatchObject({ taps: 4, visitors: 3, paidTaps: 3, logged: 1 });
  });

  it("orders buckets by taps and labels them", () => {
    const s = summariseTaps([
      tap({ place: "footer" }),
      tap({ place: "sticky_bar", leadId: "L1" }),
      tap({ place: "sticky_bar" }),
    ]);
    expect(s.byPlacement.map((b) => [b.label, b.taps, b.leads])).toEqual([
      ["Sticky call bar", 2, 1],
      ["Footer", 1, 0],
    ]);
  });

  it("names the no-campaign bucket rather than leaving it blank", () => {
    expect(summariseTaps([tap({})]).byCampaign[0].label).toBe("(no campaign)");
  });
});

describe("tapAge", () => {
  const now = new Date("2026-09-29T10:00:00Z");
  it("reads naturally at each scale", () => {
    expect(tapAge(new Date("2026-09-29T09:59:30Z"), now)).toBe("just now");
    expect(tapAge(new Date("2026-09-29T09:57:00Z"), now)).toBe("3 min ago");
    expect(tapAge(new Date("2026-09-29T07:00:00Z"), now)).toBe("3 h ago");
    expect(tapAge(new Date("2026-09-27T10:00:00Z"), now)).toBe("2 d ago");
  });
});

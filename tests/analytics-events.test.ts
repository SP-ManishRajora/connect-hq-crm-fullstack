import { describe, it, expect } from "vitest";
import {
  cleanEvent,
  cleanBatch,
  normalisePath,
  resolveOccurredAt,
  classifyDevice,
  ipPrefix,
  MAX_BATCH,
} from "@/lib/analytics/events";

/*
 * /api/track is open to the internet by necessity — it is called by a script in
 * a visitor's browser, which cannot hold a secret. These tests cover what that
 * forces: nothing from the payload is trusted, and a bad event never costs the
 * good ones in the same beacon.
 */

const base = { name: "page_view", visitorId: "v1", sessionId: "s1", path: "/x" };

describe("normalisePath", () => {
  it("strips the query string so one page groups as one row", () => {
    // Otherwise ?gclid=… scatters a single page across hundreds of rows in the
    // "top pages" table. Attribution has its own columns; nothing is lost.
    expect(normalisePath("/green-park.html?gclid=abc&utm_source=x")).toBe("/green-park.html");
  });

  it("accepts a full URL and keeps only the path", () => {
    expect(normalisePath("https://connecthq.co.in/about.html?a=1")).toBe("/about.html");
  });

  it("normalises the empty, bare and trailing-slash cases", () => {
    expect(normalisePath("")).toBe("/");
    expect(normalisePath(undefined)).toBe("/");
    expect(normalisePath("about.html")).toBe("/about.html");
    expect(normalisePath("/about/")).toBe("/about");
    expect(normalisePath("/")).toBe("/"); // root keeps its slash
  });

  it("drops the fragment", () => {
    expect(normalisePath("/pricing#plans")).toBe("/pricing");
  });
});

describe("resolveOccurredAt", () => {
  const now = new Date("2026-09-22T12:00:00Z");

  it("uses the client timestamp when it is plausible", () => {
    const ts = new Date("2026-09-22T11:59:00Z").getTime();
    expect(resolveOccurredAt(ts, now).toISOString()).toBe("2026-09-22T11:59:00.000Z");
  });

  it("falls back to server time for a clock set far in the future", () => {
    // A device dated 2031 would otherwise write rows no report ever shows and
    // no retention prune ever catches.
    const ts = new Date("2031-01-01T00:00:00Z").getTime();
    expect(resolveOccurredAt(ts, now)).toEqual(now);
  });

  it("falls back to server time for a clock set far in the past", () => {
    expect(resolveOccurredAt(new Date("2000-01-01T00:00:00Z").getTime(), now)).toEqual(now);
  });

  it("accepts a beacon replayed within a day, for offline queues", () => {
    const ts = new Date("2026-09-22T02:00:00Z").getTime();
    expect(resolveOccurredAt(ts, now).toISOString()).toBe("2026-09-22T02:00:00.000Z");
  });

  it("falls back for junk", () => {
    expect(resolveOccurredAt("banana", now)).toEqual(now);
    expect(resolveOccurredAt(null, now)).toEqual(now);
    expect(resolveOccurredAt(-1, now)).toEqual(now);
  });
});

describe("classifyDevice", () => {
  it("reads an iPhone as mobile Safari on iOS", () => {
    const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    expect(classifyDevice(ua)).toEqual({ device: "mobile", browser: "Safari", os: "iOS" });
  });

  it("reads an iPad as a tablet", () => {
    expect(classifyDevice("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1").device).toBe("tablet");
  });

  it("distinguishes Edge and Chrome, which both claim Chrome", () => {
    const edge = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120";
    const chrome = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120 Safari/537.36";
    expect(classifyDevice(edge).browser).toBe("Edge");
    expect(classifyDevice(chrome).browser).toBe("Chrome");
  });

  it("treats an Android without 'Mobile' as a tablet", () => {
    expect(classifyDevice("Mozilla/5.0 (Linux; Android 13; SM-X200) Safari/537.36").device).toBe("tablet");
  });

  it("returns nulls rather than guessing when there is no user-agent", () => {
    expect(classifyDevice(null)).toEqual({ device: null, browser: null, os: null });
  });
});

describe("ipPrefix", () => {
  it("keeps a /24 of an IPv4 address", () => {
    expect(ipPrefix("203.0.113.42")).toBe("203.0.113.0");
  });

  it("unwraps an IPv4-mapped IPv6 address", () => {
    // What a dual-stack server sees for an ordinary IPv4 client. Without the
    // unwrap it takes the IPv6 branch and the full address survives.
    expect(ipPrefix("::ffff:203.0.113.42")).toBe("203.0.113.0");
  });

  it("truncates IPv6 to its first four groups", () => {
    expect(ipPrefix("2001:db8:85a3:8d3:1319:8a2e:370:7348")).toBe("2001:db8:85a3:8d3::");
  });

  it("returns null for junk rather than storing it", () => {
    expect(ipPrefix("unknown")).toBeNull();
    expect(ipPrefix("")).toBeNull();
    expect(ipPrefix(null)).toBeNull();
    expect(ipPrefix("1.2.3")).toBeNull();
  });
});

describe("cleanEvent", () => {
  it("accepts a well-formed event", () => {
    const e = cleanEvent({ ...base, utmCampaign: "delhi", gclid: "G1" });
    expect(e?.name).toBe("page_view");
    expect(e?.utmCampaign).toBe("delhi");
  });

  it("rejects an event name that is not on the whitelist", () => {
    // This column is grouped by in every dashboard query; one typo'd name
    // silently becomes a new row in every report.
    expect(cleanEvent({ ...base, name: "evil_event" })).toBeNull();
    expect(cleanEvent({ ...base, name: "" })).toBeNull();
  });

  it("rejects an event with no visitor or session", () => {
    // Without these it cannot be grouped into a journey, which is the point.
    expect(cleanEvent({ ...base, visitorId: "" })).toBeNull();
    expect(cleanEvent({ ...base, sessionId: undefined })).toBeNull();
  });

  it("rejects a non-object", () => {
    expect(cleanEvent(null as never)).toBeNull();
    expect(cleanEvent("nope" as never)).toBeNull();
  });

  it("caps an over-long gclid rather than rejecting the event", () => {
    const e = cleanEvent({ ...base, gclid: "X".repeat(900) });
    expect(e?.gclid?.length).toBe(512);
  });

  it("never stores '[object Object]' for a field sent as an object", () => {
    // A hostile or buggy client can send any shape; stringifying it would put
    // literal "[object Object]" into a campaign report.
    const e = cleanEvent({ ...base, utmSource: { a: 1 } });
    expect(e?.utmSource).toBeNull();
  });

  it("serialises meta, and drops an empty one", () => {
    expect(cleanEvent({ ...base, meta: { depth: 50 } })?.meta).toBe('{"depth":50}');
    expect(cleanEvent({ ...base, meta: {} })?.meta).toBeNull();
  });

  it("survives meta that cannot be serialised", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(cleanEvent({ ...base, meta: circular })?.meta).toBeNull();
  });

  it("falls back to the url when no path is given", () => {
    const e = cleanEvent({ ...base, path: undefined, url: "https://connecthq.co.in/a.html?x=1" });
    expect(e?.path).toBe("/a.html");
  });
});

describe("cleanBatch", () => {
  it("keeps the good events when one in the batch is bad", () => {
    // One malformed row in a beacon of ten must not cost the other nine.
    const out = cleanBatch([base, { ...base, name: "evil_event" }, { ...base, name: "phone_click" }]);
    expect(out.map((e) => e.name)).toEqual(["page_view", "phone_click"]);
  });

  it("accepts a single object as well as an array", () => {
    expect(cleanBatch(base)).toHaveLength(1);
  });

  it("caps how many events one request can write", () => {
    const many = Array.from({ length: MAX_BATCH + 40 }, () => base);
    expect(cleanBatch(many)).toHaveLength(MAX_BATCH);
  });

  it("returns nothing for junk", () => {
    expect(cleanBatch(null)).toEqual([]);
    expect(cleanBatch([])).toEqual([]);
    expect(cleanBatch(["nope", 5])).toEqual([]);
  });
});

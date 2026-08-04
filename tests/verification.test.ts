import { describe, it, expect } from "vitest";
import { haversineM, impliedSpeedKmh, isValidLatLng } from "@/lib/housekeeping/geo";
import { hammingHex, isNearDuplicate, isValidPhash } from "@/lib/housekeeping/phash";
import { sniffImageMime, isAllowedMime, sha256Hex } from "@/lib/housekeeping/storage";
import { anglesForCategory, parseJsonArray } from "@/lib/housekeeping/types";

// Presence verification and evidence integrity — the primitives behind
// geofencing, duplicate detection and file-type safety.

describe("haversine distance", () => {
  it("is zero for the same point", () => {
    expect(haversineM(28.6139, 77.209, 28.6139, 77.209)).toBe(0);
  });

  it("measures a known separation", () => {
    // India Gate → Connaught Place, roughly 2.5 km.
    const d = haversineM(28.6129, 77.2295, 28.6315, 77.2167);
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(3500);
  });

  it("is symmetric", () => {
    const a = haversineM(28.61, 77.20, 28.62, 77.21);
    const b = haversineM(28.62, 77.21, 28.61, 77.20);
    expect(Math.abs(a - b)).toBeLessThan(0.001);
  });

  it("resolves the small distances that actually matter indoors", () => {
    // ~11 m apart — the scale that separates "in the bathroom" from "in the corridor".
    const d = haversineM(28.61390, 77.20900, 28.61400, 77.20900);
    expect(d).toBeGreaterThan(8);
    expect(d).toBeLessThan(15);
  });
});

describe("implied travel speed", () => {
  it("computes km/h from metres and seconds", () => {
    expect(impliedSpeedKmh(1000, 3600)).toBeCloseTo(1, 5);
  });

  it("returns null for a non-positive gap rather than dividing by zero", () => {
    // Clock skew or two records in the same instant must not read as infinite speed.
    expect(impliedSpeedKmh(100, 0)).toBeNull();
    expect(impliedSpeedKmh(100, -5)).toBeNull();
  });

  it("catches an implausible jump between areas", () => {
    // 5 km in 10 seconds = 1800 km/h.
    expect(impliedSpeedKmh(5000, 10)!).toBeGreaterThan(80);
  });
});

describe("lat/lng validation", () => {
  it("accepts real coordinates", () => {
    expect(isValidLatLng(28.6139, 77.209)).toBe(true);
    expect(isValidLatLng(0, 0)).toBe(true);
  });

  it("rejects out-of-range and non-numeric values", () => {
    expect(isValidLatLng(91, 77)).toBe(false);
    expect(isValidLatLng(28, 181)).toBe(false);
    expect(isValidLatLng(NaN, 77)).toBe(false);
    expect(isValidLatLng("28" as unknown as number, 77)).toBe(false);
    expect(isValidLatLng(null as unknown as number, 77)).toBe(false);
  });
});

describe("perceptual hash comparison", () => {
  it("scores an identical hash as zero distance", () => {
    expect(hammingHex("a1b2c3d4e5f60718", "a1b2c3d4e5f60718")).toBe(0);
  });

  it("counts differing bits", () => {
    // 0 vs 1 differs in exactly one bit.
    expect(hammingHex("0000000000000000", "0000000000000001")).toBe(1);
    // f = 1111, so a full nibble difference is 4 bits.
    expect(hammingHex("0000000000000000", "000000000000000f")).toBe(4);
  });

  it("treats near-identical images as duplicates", () => {
    expect(isNearDuplicate("a1b2c3d4e5f60718", "a1b2c3d4e5f60719")).toBe(true);
  });

  it("treats genuinely different images as distinct", () => {
    expect(isNearDuplicate("0000000000000000", "ffffffffffffffff")).toBe(false);
  });

  it("refuses to compare mismatched or empty hashes", () => {
    // Guards against a truncated hash silently reading as "similar to everything".
    expect(hammingHex("abc", "abcdef0123456789")).toBe(Number.MAX_SAFE_INTEGER);
    expect(hammingHex("", "")).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("validates hash format", () => {
    expect(isValidPhash("a1b2c3d4e5f60718")).toBe(true);
    expect(isValidPhash("A1B2C3D4E5F60718")).toBe(true);
    expect(isValidPhash("tooshort")).toBe(false);
    expect(isValidPhash("g1b2c3d4e5f60718")).toBe(false); // g is not hex
    expect(isValidPhash(null)).toBe(false);
  });
});

describe("image type sniffing", () => {
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20),
  ]);
  const webp = Buffer.concat([
    Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20),
  ]);

  it("identifies real image formats by magic bytes", () => {
    expect(sniffImageMime(jpeg)).toBe("image/jpeg");
    expect(sniffImageMime(png)).toBe("image/png");
    expect(sniffImageMime(webp)).toBe("image/webp");
  });

  it("rejects a non-image however it is named", () => {
    // A .txt renamed to .jpg with a declared image mime type must still fail.
    const text = Buffer.from("this is not an image, it is a script");
    expect(sniffImageMime(text)).toBeNull();
    expect(isAllowedMime(sniffImageMime(text))).toBe(false);
  });

  it("rejects a truncated file", () => {
    expect(sniffImageMime(Buffer.from([0xff, 0xd8]))).toBeNull();
  });
});

describe("sha256 (authoritative duplicate check)", () => {
  it("is stable for identical bytes", () => {
    const a = Buffer.from("evidence");
    expect(sha256Hex(a)).toBe(sha256Hex(Buffer.from("evidence")));
  });

  it("differs for different bytes", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });

  it("produces a 64-char hex digest", () => {
    expect(sha256Hex(Buffer.from("x"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("photo angle defaults", () => {
  it("gives bathrooms their own guidance", () => {
    const a = anglesForCategory("BATHROOM");
    expect(a).toHaveLength(4);
    expect(a[0]).toMatch(/washbasin/i);
  });

  it("falls back to generic angles for an unknown category", () => {
    expect(anglesForCategory("SOMETHING_NEW")).toHaveLength(4);
  });
});

describe("JSON array parsing", () => {
  it("parses a stored array", () => {
    expect(parseJsonArray('["a","b"]')).toEqual(["a", "b"]);
  });

  it("never throws on malformed or empty input", () => {
    // A corrupt settings row must not break an inspection.
    expect(parseJsonArray("not json")).toEqual([]);
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray('{"a":1}')).toEqual([]);
  });
});

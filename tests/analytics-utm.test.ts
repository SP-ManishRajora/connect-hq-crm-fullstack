import { describe, it, expect } from "vitest";
import {
  UTM_DIMENSIONS,
  NOT_SET,
  isUtmDimension,
  type UtmDimension,
} from "@/lib/analytics/utm";

/*
 * The UTM explorer takes a dimension name straight from the query string and
 * puts it into a Prisma groupBy and a raw SQL column reference. That is the
 * dangerous part, and it is what these tests guard: only known dimensions may
 * ever reach a query.
 */

describe("isUtmDimension", () => {
  it("accepts every documented dimension", () => {
    for (const d of Object.keys(UTM_DIMENSIONS)) {
      expect(isUtmDimension(d)).toBe(true);
    }
  });

  it("rejects anything not on the list", () => {
    // getUtmTrend interpolates the dimension into raw SQL as a column name, so
    // an unchecked value here would be an injection point. The page never calls
    // it without passing through this guard.
    expect(isUtmDimension("status")).toBe(false);
    expect(isUtmDimension("budget")).toBe(false);
    expect(isUtmDimension("id`; DROP TABLE Lead; --")).toBe(false);
    expect(isUtmDimension("")).toBe(false);
    expect(isUtmDimension(undefined)).toBe(false);
    expect(isUtmDimension(null)).toBe(false);
  });

  it("is not fooled by inherited object properties", () => {
    // A plain `key in obj` check would accept these, since every object
    // inherits them from Object.prototype.
    expect(isUtmDimension("toString")).toBe(false);
    expect(isUtmDimension("constructor")).toBe(false);
    expect(isUtmDimension("__proto__")).toBe(false);
  });

  it("narrows the type for downstream use", () => {
    const raw: string | undefined = "utmTerm";
    if (isUtmDimension(raw)) {
      const d: UtmDimension = raw; // compiles only if narrowing works
      expect(UTM_DIMENSIONS[d].label).toBe("Keyword");
    } else {
      throw new Error("expected utmTerm to be a valid dimension");
    }
  });
});

describe("UTM_DIMENSIONS", () => {
  it("covers all five standard UTM parameters", () => {
    // All five are captured by the website and stored on Lead. Dropping one
    // here would silently make that column unreadable again, which is the
    // exact problem this module was built to fix.
    expect(Object.keys(UTM_DIMENSIONS).sort()).toEqual(
      ["utmCampaign", "utmContent", "utmMedium", "utmSource", "utmTerm"].sort(),
    );
  });

  it("gives every dimension a human label and a hint", () => {
    for (const [key, meta] of Object.entries(UTM_DIMENSIONS)) {
      expect(meta.label, `${key} needs a label`).toBeTruthy();
      expect(meta.hint, `${key} needs a hint`).toBeTruthy();
      // The label is a column header; a raw field name there is a bug.
      expect(meta.label).not.toMatch(/^utm/i);
    }
  });

  it("names the two dimensions that were previously invisible", () => {
    // utm_term and utm_content were stored but shown nowhere before this page.
    expect(UTM_DIMENSIONS.utmTerm.label).toBe("Keyword");
    expect(UTM_DIMENSIONS.utmContent.label).toBe("Ad variant");
  });
});

describe("NOT_SET", () => {
  it("is a value a real UTM parameter could not collide with", () => {
    // It doubles as a filter value meaning "rows where this is null", so a
    // campaign genuinely called this would break the drill-down.
    expect(NOT_SET).toBe("(not set)");
    expect(NOT_SET).toMatch(/^\(.*\)$/);
  });
});

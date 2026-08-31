import { describe, it, expect } from "vitest";
import { istMonthRange } from "@/lib/utils";

// IST = UTC+5:30, no DST. An IST month therefore starts at 18:30Z on the last
// day of the previous month.
describe("istMonthRange", () => {
  it("spans the IST calendar month as UTC instants", () => {
    const { start, end } = istMonthRange(new Date("2026-08-31T09:00:00Z"));
    expect(start.toISOString()).toBe("2026-07-31T18:30:00.000Z"); // 1 Aug 00:00 IST
    expect(end.toISOString()).toBe("2026-08-31T18:30:00.000Z"); // 1 Sep 00:00 IST
  });

  it("includes a booking early on the 1st IST, which the old UTC range missed", () => {
    const { start, end } = istMonthRange(new Date("2026-08-15T00:00:00Z"));
    const b = new Date("2026-08-01T02:00:00Z"); // 07:30 IST on the 1st
    expect(b >= start && b < end).toBe(true);
  });

  it("excludes a booking just after midnight IST on the 1st of the next month", () => {
    const { start, end } = istMonthRange(new Date("2026-08-15T00:00:00Z"));
    const b = new Date("2026-08-31T19:00:00Z"); // 00:30 IST, 1 Sep
    expect(b >= start && b < end).toBe(false);
  });

  it("keeps the last day of the month, which a midnight `lte` bound dropped", () => {
    const { start, end } = istMonthRange(new Date("2026-08-15T00:00:00Z"));
    const b = new Date("2026-08-31T12:00:00Z"); // 17:30 IST on the 31st
    expect(b >= start && b < end).toBe(true);
  });

  it("rolls over December to January correctly", () => {
    const { start, end } = istMonthRange(new Date("2026-12-10T00:00:00Z"));
    expect(start.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(end.toISOString()).toBe("2026-12-31T18:30:00.000Z");
  });

  it("buckets a September booking into September, not the current month", () => {
    // The reported bug: bookings on 1/3 Sept while today is 31 Aug.
    const sept = istMonthRange(new Date("2026-09-03T03:14:00Z"));
    const b = new Date("2026-09-03T03:14:00Z");
    expect(b >= sept.start && b < sept.end).toBe(true);
    const aug = istMonthRange(new Date("2026-08-31T09:00:00Z"));
    expect(b >= aug.start && b < aug.end).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { bookingWindowError, minutesOfDayIST } from "@/lib/utils";

// IST = UTC+5:30. Times are written in IST explicitly so the assertions hold
// whatever timezone the test host (or CI) runs in.
const ist = (d: string, t: string) => new Date(`${d}T${t}+05:30`);

describe("client booking window — start time only", () => {
  it("allows a mid-day slot", () => {
    expect(bookingWindowError(ist("2026-09-01", "10:00"), ist("2026-09-01", "11:00"))).toBeNull();
  });
  it("allows a start at exactly 08:00", () => {
    expect(bookingWindowError(ist("2026-09-01", "08:00"), ist("2026-09-01", "09:00"))).toBeNull();
  });
  it("allows a start at exactly 19:30, the last bookable slot", () => {
    expect(bookingWindowError(ist("2026-09-01", "19:30"), ist("2026-09-01", "20:30"))).toBeNull();
  });
  it("allows a booking that runs past 19:30 (19:00–20:00)", () => {
    expect(bookingWindowError(ist("2026-09-01", "19:00"), ist("2026-09-01", "20:00"))).toBeNull();
  });
  it("allows a slot ending after midnight, since only the start is bound", () => {
    expect(bookingWindowError(ist("2026-09-01", "19:00"), ist("2026-09-02", "00:30"))).toBeNull();
  });
  it("rejects a start at 07:59", () => {
    expect(bookingWindowError(ist("2026-09-01", "07:59"), ist("2026-09-01", "09:00"))).toMatch(/before/);
  });
  it("rejects a start at 19:31", () => {
    expect(bookingWindowError(ist("2026-09-01", "19:31"), ist("2026-09-01", "20:00"))).toMatch(/last bookable/);
  });
  it("rejects a start at 21:00", () => {
    expect(bookingWindowError(ist("2026-09-01", "21:00"), ist("2026-09-01", "22:00"))).toMatch(/last bookable/);
  });
  it("rejects an early-hours start", () => {
    expect(bookingWindowError(ist("2026-09-01", "02:00"), ist("2026-09-01", "03:00"))).toMatch(/before/);
  });
});

describe("minutesOfDayIST", () => {
  it("reads IST hours regardless of the server timezone", () => {
    // 02:30Z is 08:00 IST — the server runs UTC, so this is the case that matters.
    expect(minutesOfDayIST(new Date("2026-09-01T02:30:00Z"))).toBe(480);
  });
  it("normalises IST midnight to 0", () => {
    // 18:30Z is 00:00 IST the next day.
    expect(minutesOfDayIST(new Date("2026-09-01T18:30:00Z"))).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { hashToken } from "@/lib/mobile/tokens";
import { offlineVisitSchema, syncSchema } from "@/lib/housekeeping/sync";
import { VISIT_FLAGS, FLAG_LABELS } from "@/lib/housekeeping/types";
import { mergeFlags } from "@/lib/housekeeping/verification";

// Android staff app: bearer-token handling, the offline sync contract, and the
// flag that keeps offline-captured evidence distinguishable from verified.

describe("refresh token hashing", () => {
  it("never returns the token itself", () => {
    const t = "some-opaque-refresh-token";
    expect(hashToken(t)).not.toBe(t);
    expect(hashToken(t)).not.toContain(t);
  });

  it("is deterministic, so a presented token can be looked up", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
  });

  it("is a fixed-length sha256 hex digest", () => {
    expect(hashToken("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("separates tokens that differ by one character", () => {
    expect(hashToken("token-a")).not.toBe(hashToken("token-b"));
  });
});

describe("offline visit contract", () => {
  const valid = {
    clientVisitId: "cv-0123456789abcdef",
    roundId: "round-1",
    code: "AREA-XYZ",
    capturedAt: "2026-08-20T09:15:00.000Z",
    lat: 28.6139,
    lng: 77.209,
    accuracyM: 12,
    deviceId: "device-1",
    dwellSeconds: 120,
  };

  it("accepts a well-formed queued visit", () => {
    expect(offlineVisitSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a client id long enough to be collision-resistant", () => {
    // The app generates this; a short one risks two phones colliding and one
    // supervisor's visit being returned as another's DUPLICATE.
    const r = offlineVisitSchema.safeParse({ ...valid, clientVisitId: "short" });
    expect(r.success).toBe(false);
  });

  it("requires capturedAt to be a real timestamp", () => {
    expect(offlineVisitSchema.safeParse({ ...valid, capturedAt: "yesterday" }).success).toBe(false);
  });

  it("rejects out-of-range coordinates", () => {
    expect(offlineVisitSchema.safeParse({ ...valid, lat: 99 }).success).toBe(false);
    expect(offlineVisitSchema.safeParse({ ...valid, lng: -200 }).success).toBe(false);
  });

  it("allows a visit with no GPS at all", () => {
    // Offline often means indoors with no fix. The visit is still recorded; the
    // missing position becomes a flag, not a rejection.
    const { lat, lng, accuracyM, ...noGps } = valid;
    expect(offlineVisitSchema.safeParse(noGps).success).toBe(true);
  });

  it("caps a batch so one sync cannot monopolise the server", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      ...valid,
      clientVisitId: `cv-000000000000000${i}`,
    }));
    expect(syncSchema.safeParse({ visits: many }).success).toBe(false);
    expect(syncSchema.safeParse({ visits: many.slice(0, 50) }).success).toBe(true);
  });

  it("accepts an empty queue", () => {
    expect(syncSchema.safeParse({ visits: [] }).success).toBe(true);
  });
});

describe("OFFLINE_CAPTURED flag", () => {
  it("is a known flag with a human label", () => {
    expect(VISIT_FLAGS.OFFLINE_CAPTURED).toBe("OFFLINE_CAPTURED");
    expect(FLAG_LABELS.OFFLINE_CAPTURED).toBeTruthy();
  });

  it("says the time came from the device, not the server", () => {
    // The label is what a reviewer reads when judging the evidence, so it must
    // convey WHY the visit is weaker, not merely that it was offline.
    expect(FLAG_LABELS.OFFLINE_CAPTURED.toLowerCase()).toContain("device");
  });

  it("merges alongside verification flags rather than replacing them", () => {
    const merged = mergeFlags(
      JSON.stringify([VISIT_FLAGS.GEOFENCE_FAIL]),
      [VISIT_FLAGS.OFFLINE_CAPTURED],
    );
    const parsed = JSON.parse(merged!) as string[];
    expect(parsed).toContain(VISIT_FLAGS.GEOFENCE_FAIL);
    expect(parsed).toContain(VISIT_FLAGS.OFFLINE_CAPTURED);
  });

  it("does not duplicate when a batch is retried", () => {
    const once = mergeFlags(null, [VISIT_FLAGS.OFFLINE_CAPTURED]);
    const twice = mergeFlags(once, [VISIT_FLAGS.OFFLINE_CAPTURED]);
    expect((JSON.parse(twice!) as string[]).filter((f) => f === "OFFLINE_CAPTURED")).toHaveLength(1);
  });
});

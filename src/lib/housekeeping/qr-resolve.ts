import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { extractCode } from "./qr-code";

export { extractCode };

// One sticker per area. A single printed code must work for whoever scans it —
// a client reporting a mess, a supervisor opening an inspection visit, a cleaner
// confirming they stood in the room. Which of those happens is decided by the
// session, not by which sticker was chosen off the wall.
//
// The two tables stay separate: `LocationQrCode` is minted by hk_admin and is the
// only thing an InspectionVisit may reference, `ClientQrCode` is reachable without
// a session. Keeping them apart means a leaked public code can never be replayed
// as an inspection credential, and it is what the schema comment already promises.
// This module is the seam that lets one *printed* code resolve through either
// table to the same area, without merging them.

export type QrKind = "STAFF" | "CLIENT";

export type ResolvedQr = {
  kind: QrKind;
  /** Row id in whichever table matched. */
  id: string;
  code: string;
  locationId: string;
  version: number;
  /** False for a rotated printout — callers decide whether that is fatal. */
  active: boolean;
};

/**
 * Opaque random code — deliberately carries no centre/area information, so a
 * photographed QR reveals nothing and only a server lookup can resolve it.
 */
export function newQrCode(): string {
  return randomBytes(12).toString("base64url");
}

/**
 * Resolve a scanned code through BOTH tables and report which one matched.
 *
 * Inactive rows are returned rather than hidden: "this printout was retired" is a
 * different message from "we have never seen this code", and only the caller
 * knows whether a retired code should be a 410 or a soft warning.
 *
 * Staff is checked first — an inspection scan is the hot path, and the two code
 * spaces are disjoint in practice (128 bits of randomness each).
 */
export async function resolveQr(rawCode: string): Promise<ResolvedQr | null> {
  const code = extractCode(rawCode);
  if (!code) return null;

  const staff = await prisma.locationQrCode.findUnique({
    where: { code },
    select: { id: true, code: true, locationId: true, version: true, active: true },
  });
  if (staff) return { kind: "STAFF", ...staff };

  const client = await prisma.clientQrCode.findUnique({
    where: { code },
    select: { id: true, code: true, locationId: true, version: true, active: true },
  });
  if (client) return { kind: "CLIENT", ...client };

  return null;
}

/**
 * Resolve a code to an area for the INSPECTION flow.
 *
 * An InspectionVisit.qrCodeId may only point at a LocationQrCode, so when a
 * supervisor scans the client sticker we resolve through the location and attach
 * that area's own active staff code. The visit's provenance stays honest — it
 * records the staff code for the area that was genuinely scanned — while the
 * person in the room is spared having to find a second sticker.
 *
 * Returns `staffQrCodeId: null` when the area has no active staff code; the visit
 * is still recorded, because refusing to inspect an area over a missing printout
 * would be worse than a null column.
 */
export async function resolveForInspection(
  rawCode: string,
): Promise<{ locationId: string; staffQrCodeId: string | null; scanned: ResolvedQr } | null> {
  const hit = await resolveQr(rawCode);
  if (!hit) return null;

  if (hit.kind === "STAFF") {
    return { locationId: hit.locationId, staffQrCodeId: hit.id, scanned: hit };
  }

  const staff = await prisma.locationQrCode.findFirst({
    where: { locationId: hit.locationId, active: true },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return { locationId: hit.locationId, staffQrCodeId: staff?.id ?? null, scanned: hit };
}

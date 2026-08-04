// Device registration and revocation (Phase 10, item 10.6).
//
// A revoked device is REFUSED at scan time, not merely flagged. Revocation only
// means something if the lost or shared phone actually stops working — a flag
// that a manager reviews next week does not protect anything.
//
// Honest about the limits: `deviceId` is a localStorage value the browser can
// clear, so this stops a casual reuse of a lost phone, not a determined actor.
// It is one signal among several (GPS, server time, dwell, photo hashing), not a
// standalone control.

import { prisma } from "@/lib/db";
import { HttpError } from "./types";
import { logAction } from "@/lib/audit";
import { getRetentionConfig } from "./settings";

export type DeviceCheck = {
  registered: boolean;
  revoked: boolean;
  revokedAt: Date | null;
  label: string | null;
};

export async function checkDevice(userId: string, deviceId: string): Promise<DeviceCheck> {
  const row = await prisma.deviceRegistration.findUnique({
    where: { userId_deviceId: { userId, deviceId } },
    select: { revokedAt: true, label: true },
  });
  return {
    registered: Boolean(row),
    revoked: Boolean(row?.revokedAt),
    revokedAt: row?.revokedAt ?? null,
    label: row?.label ?? null,
  };
}

// Throws 403 when the device is revoked and blocking is enabled. Call this
// BEFORE any write, so a rejected scan leaves no partial record.
export async function assertDeviceAllowed(userId: string, deviceId: string | null | undefined) {
  if (!deviceId) return; // no device id supplied — nothing to check
  const cfg = await getRetentionConfig();
  if (!cfg.blockRevokedDevices) return;

  const d = await checkDevice(userId, deviceId);
  if (d.revoked) {
    throw new HttpError(
      403,
      "This device has been revoked by an administrator and can no longer be used for inspections. Contact your administrator.",
    );
  }
}

// Records a sighting. Never resurrects a revoked device — `revokedAt` is left
// untouched, so an unregister/re-register cycle cannot silently undo revocation.
export async function touchDevice(userId: string, deviceId: string) {
  await prisma.deviceRegistration.upsert({
    where: { userId_deviceId: { userId, deviceId } },
    create: { userId, deviceId },
    update: { lastSeenAt: new Date() },
  });
}

export async function revokeDevice(id: string, actorId: string, reason?: string | null) {
  const existing = await prisma.deviceRegistration.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!existing) throw new HttpError(404, "Device not found");
  if (existing.revokedAt) throw new HttpError(409, "This device is already revoked");

  const row = await prisma.deviceRegistration.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await logAction({
    userId: actorId,
    action: "HK_DEVICE_REVOKED",
    targetType: "DeviceRegistration",
    targetId: id,
    meta: {
      deviceId: existing.deviceId,
      ownerId: existing.user.id,
      ownerName: existing.user.name,
      label: existing.label,
      lastSeenAt: existing.lastSeenAt,
      reason: reason ?? null,
    },
  });

  return row;
}

export async function restoreDevice(id: string, actorId: string) {
  const existing = await prisma.deviceRegistration.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!existing) throw new HttpError(404, "Device not found");
  if (!existing.revokedAt) throw new HttpError(409, "This device is not revoked");

  const row = await prisma.deviceRegistration.update({
    where: { id },
    data: { revokedAt: null },
  });

  await logAction({
    userId: actorId,
    action: "HK_DEVICE_RESTORED",
    targetType: "DeviceRegistration",
    targetId: id,
    meta: {
      deviceId: existing.deviceId,
      ownerId: existing.user.id,
      ownerName: existing.user.name,
      revokedSince: existing.revokedAt,
    },
  });

  return row;
}

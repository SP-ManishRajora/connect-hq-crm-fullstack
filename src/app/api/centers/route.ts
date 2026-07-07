import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

/**
 * POST /api/centers — Admin/Owner only.
 *
 * Now creates a "shell" center with basic details only:
 *   { name, city, address, totalSeats, openSeats? }
 *
 * Detailed setup (cabins, photos, floor map, common-area photos,
 * seat-to-client assignment, inventory) is done by the Community Manager
 * via /centers/[id]/setup using:
 *     POST   /api/centers/[id]/cabins
 *     PATCH  /api/centers/[id]/setup
 *     POST   /api/seats/[id]/assign
 *
 * This split makes the workflow:
 *   ADMIN     → creates basic center
 *   CM/OWNER  → completes detailed setup
 *   ACCOUNTS  → uploads contracts on the Contracts Inbox
 */
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !requireRole(u.role, ["ADMIN", "OWNER", "CENTER_MANAGER"])) return NextResponse.json({ error: "Admin/Owner/Center Manager only" }, { status: 403 });
  const b = await req.json();
  if (!b.name || !b.city || !b.totalSeats) return NextResponse.json({ error: "name, city, totalSeats required" }, { status: 400 });

  const openSeats = Number(b.openSeats || 0);
  if (openSeats > Number(b.totalSeats)) {
    return NextResponse.json({ error: `openSeats (${openSeats}) cannot exceed totalSeats (${b.totalSeats})` }, { status: 400 });
  }

  const center = await prisma.center.create({
    data: {
      name: b.name,
      city: b.city,
      address: b.address || null,
      totalSeats: Number(b.totalSeats),
      commonAreaPhotos: b.commonAreaPhotos || null,
    },
  });

  // Pre-create the open / hot-desk seats so they show up immediately on the map.
  for (let k = 1; k <= openSeats; k++) {
    await prisma.seat.create({ data: { centerId: center.id, number: `S${k}`, zone: "Open" } });
  }
  return NextResponse.json(center);
}

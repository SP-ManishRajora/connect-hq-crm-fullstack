import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canManageCenter } from "@/lib/center-access";

// PATCH body: { mapImagePath?, commonAreaPhotos?: string[] }
// Center managers (own center) + admin/owner.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!canManageCenter(u, params.id)) return NextResponse.json({ error: "Not your center" }, { status: 403 });
  const b = await req.json();
  const updated = await prisma.center.update({
    where: { id: params.id },
    data: {
      mapImagePath: b.mapImagePath ?? undefined,
      commonAreaPhotos: Array.isArray(b.commonAreaPhotos) ? JSON.stringify(b.commonAreaPhotos) : undefined,
    },
  });
  return NextResponse.json(updated);
}

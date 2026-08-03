import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { rateLimit, clientIp } from "@/lib/housekeeping/rate-limit";

export const runtime = "nodejs";

// PUBLIC. Resolves a client QR into the centre/floor/area plus the request
// catalogue and the company list for that centre.
//
// Rate limited because it is an unauthenticated read that touches the client
// list. Returns only names and ids — no contact details, no financials.
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  const ip = clientIp(req);
  const limit = rateLimit(`crresolve:${ip}`, 40, 10 * 60 * 1000);
  if (limit.limited) {
    return NextResponse.json(
      { error: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const qr = await prisma.clientQrCode.findUnique({
    where: { code: params.code },
    include: {
      location: {
        include: {
          center: { select: { id: true, name: true, city: true } },
          floor: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!qr || !qr.active || !qr.location || qr.location.deletedAt || !qr.location.active) {
    return NextResponse.json({ error: "This code is not recognised." }, { status: 404 });
  }

  const [types, clients] = await Promise.all([
    prisma.cleaningRequestType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, group: true, slaMinutes: true },
    }),
    prisma.client.findMany({
      where: { centerId: qr.location.center.id },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 500,
    }),
  ]);

  return NextResponse.json({
    area: {
      name: qr.location.name,
      category: qr.location.category,
      floor: qr.location.floor?.name ?? null,
    },
    centre: { name: qr.location.center.name, city: qr.location.center.city },
    types,
    // Exposed as `name` so the public form stays agnostic of the ERP's field naming.
    clients: clients.map((c) => ({ id: c.id, name: c.companyName })),
  });
}

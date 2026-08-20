import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveUser } from "@/lib/housekeeping/route-helpers";
import { verifyPhotoSignature, readPhoto } from "@/lib/housekeeping/storage";

export const runtime = "nodejs";

// GET /api/housekeeping/photos/[id]/file?exp=…&sig=…
//
// Two independent gates, deliberately: a valid signature AND a live session.
// A leaked URL alone therefore grants nothing, and a signed-in user still can't
// enumerate photos without a signature.
//
// Viewing is open to ANY signed-in staff member (decided 2026-08-04) — not just
// the housekeeping module — so anyone reviewing a centre can see the evidence.
// Two limits remain, because these are internal operational records that can
// show staff and client property:
//   • CLIENT-role users are excluded (portal tenants are not staff)
//   • centre scoping still applies: a centre-bound user sees only their centre
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const exp = Number(searchParams.get("exp"));
  const sig = searchParams.get("sig") || "";

  if (!verifyPhotoSignature(params.id, exp, sig)) {
    return NextResponse.json({ error: "Link expired or invalid" }, { status: 403 });
  }

  const u = await resolveUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (u.role === "CLIENT") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id: params.id },
    select: {
      filePath: true, mimeType: true, purgedAt: true,
      location: { select: { centerId: true } },
    },
  });
  if (!photo) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 410 Gone, not 404 — the record exists, the bytes were removed by policy.
  if (photo.purgedAt) {
    return NextResponse.json(
      {
        error: "This photograph was removed under the data-retention policy.",
        purgedAt: photo.purgedAt,
      },
      { status: 410 },
    );
  }

  // Centre scoping — a centre manager may only view their own centre's evidence.
  if (u.role !== "ADMIN" && u.role !== "OWNER" && u.centerId && photo.location.centerId !== u.centerId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const buf = await readPhoto(photo.filePath);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": photo.mimeType,
        "Content-Length": String(buf.length),
        // private: signed URLs must not be cached by shared proxies.
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "file unavailable" }, { status: 404 });
  }
}

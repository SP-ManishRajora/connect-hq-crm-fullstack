import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { verifyPhotoSignature, readPhoto } from "@/lib/housekeeping/storage";

export const runtime = "nodejs";

// GET /api/housekeeping/photos/[id]/file?exp=…&sig=…
//
// Two independent gates, deliberately: a valid signature AND a live session with
// module access. A leaked URL alone therefore grants nothing, and an authorised
// user still can't enumerate photos without a signature.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { searchParams } = new URL(req.url);
  const exp = Number(searchParams.get("exp"));
  const sig = searchParams.get("sig") || "";

  if (!verifyPhotoSignature(params.id, exp, sig)) {
    return NextResponse.json({ error: "Link expired or invalid" }, { status: 403 });
  }

  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!(await canAccessAsync(u.role, "housekeeping", u.allowedModules))) {
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

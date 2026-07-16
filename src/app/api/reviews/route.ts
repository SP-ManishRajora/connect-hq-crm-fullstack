import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { canAccess } from "@/lib/rbac";
import { logAction } from "@/lib/audit";
import { reviewSchema } from "@/lib/reviewSchema";

// POST /api/reviews — create a review/feedback entry.
// Server-side validation mirrors the client form via the shared reviewSchema,
// which also sanitises input (XSS) and enforces the conditional visitor rules.
export async function POST(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !canAccess(u.role, "reviews")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    // Flatten to { field: message } so the client can show inline errors.
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "_");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return NextResponse.json({ error: "Validation failed", fieldErrors }, { status: 400 });
  }

  const d = parsed.data;
  try {
    const review = await prisma.review.create({
      data: {
        name: d.name,
        phoneNumber: d.phoneNumber,
        companyName: d.companyName,
        email: d.email,
        feedback: d.feedback,
        isVisitor: d.isVisitor,
        purposeOfVisit: d.purposeOfVisit,
        createdById: u.id,
      },
    });
    await logAction({
      userId: u.id,
      action: "REVIEW_CREATE",
      targetType: "Review",
      targetId: review.id,
      meta: { isVisitor: review.isVisitor },
    });
    return NextResponse.json({ ok: true, id: review.id });
  } catch (err) {
    console.error("[reviews] create failed", err);
    return NextResponse.json({ error: "Failed to save review" }, { status: 500 });
  }
}

// GET /api/reviews — list active reviews (newest first). Optional ?visitor=1 filter.
export async function GET(req: NextRequest) {
  const u = await getSessionUser();
  if (!u || !canAccess(u.role, "reviews")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const visitor = url.searchParams.get("visitor");
  const where: any = { status: "Active" };
  if (visitor === "1") where.isVisitor = true;
  if (visitor === "0") where.isVisitor = false;

  const reviews = await prisma.review.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { createdBy: { select: { name: true } } },
  });
  return NextResponse.json(reviews);
}

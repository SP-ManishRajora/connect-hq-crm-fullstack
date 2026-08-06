import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import ClientReviewsClient from "./ClientReviewsClient";

export const dynamic = "force-dynamic";

// Verified client reviews left from the area stickers. Kept separate from
// /reviews (staff-captured free text, no rating) because these are the only
// feedback rows where the contact detail behind them was actually proven.
export default async function HkReviewsPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "housekeeping", me.allowedModules))) {
    redirect("/dashboard");
  }

  const wide = me.role === "ADMIN" || me.role === "OWNER";
  const centers = await prisma.center.findMany({
    where: { active: true, ...(wide ? {} : me.centerId ? { id: me.centerId } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  if (centers.length === 0) {
    return (
      <div className="max-w-2xl">
        <h1 className="text-2xl font-semibold mb-2">⭐ Client Reviews</h1>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You are not assigned to a centre yet.
        </div>
      </div>
    );
  }

  // Centre scoping is enforced here, not in the client — the list must never
  // include a centre this user cannot see.
  const centerId =
    searchParams.centerId && centers.some((c) => c.id === searchParams.centerId)
      ? searchParams.centerId
      : centers[0].id;

  const reviews = await prisma.clientReview.findMany({
    where: { centerId, status: "Active" },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      location: { select: { name: true } },
      client: { select: { companyName: true } },
    },
  });

  const canModerate = ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"].includes(me.role);

  return (
    <ClientReviewsClient
      initial={JSON.parse(JSON.stringify(reviews))}
      centers={centers}
      initialCenterId={centerId}
      canModerate={canModerate}
    />
  );
}

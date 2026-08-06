import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { resolveQr } from "@/lib/housekeeping/qr-resolve";
import ClientRequestForm from "./ClientRequestForm";
import StaffChooser from "./StaffChooser";
import ReviewForm from "./ReviewForm";

export const dynamic = "force-dynamic";

// PUBLIC by default — this is the one sticker printed for an area, and anyone may
// scan it. The code is the only thing that names the centre/floor/area.
//
// Who scans decides what happens, so nobody has to be taught which QR is theirs:
//   • no session, or ?as=client  → the cleaning-request form (unchanged for members)
//   • logged-in housekeeping staff → a chooser (inspect / complete a request / report)
//
// Staff codes resolve here too. A supervisor who scans the older staff-only sticker
// with a phone camera lands on the same chooser rather than a dead end.
export default async function ClientAreaPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { as?: string; review?: string };
}) {
  const qr = await resolveQr(params.code);
  if (!qr || !qr.active) notFound();

  const location = await prisma.inspectionLocation.findUnique({
    where: { id: qr.locationId },
    include: {
      center: { select: { id: true, name: true, city: true } },
      floor: { select: { name: true } },
    },
  });
  if (!location || location.deletedAt || !location.active) notFound();

  const area = {
    name: location.name,
    floor: location.floor?.name ?? null,
    category: location.category,
  };
  const centre = { name: location.center.name, city: location.center.city };

  // `?as=client` lets a staff member deliberately raise a request the way a member
  // would — and keeps that path reachable from the chooser.
  const me = searchParams.as === "client" ? null : await getSessionUser();
  const modules = me ? parseAllowedModules(me.allowedModules) : [];
  const canInspect = Boolean(me && canAccess(me.role, "hk_inspect", modules));
  const canRequests = Boolean(me && canAccess(me.role, "hk_requests", modules));

  // `?review=1` is the verified-review flow. Checked before the staff branch so a
  // supervisor can reach it too — the OTP, not the session, is what authorises a
  // review, and staff leaving one are held to the same proof as anyone else.
  if (searchParams.review === "1") {
    const reviewClients = await prisma.client.findMany({
      where: { centerId: location.center.id },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 500,
    });
    return (
      <ReviewForm
        code={qr.code}
        area={area}
        centre={centre}
        clients={reviewClients.map((c) => ({ id: c.id, name: c.companyName }))}
      />
    );
  }

  if (me && (canInspect || canRequests)) {
    // Only requests this person can actually act on — a centre-scoped user seeing
    // another centre's tickets here would be a leak, not a convenience.
    const openRequests = canRequests
      ? await prisma.cleaningRequest.findMany({
          where: {
            locationId: location.id,
            status: { in: ["NEW", "ASSIGNED", "ACCEPTED", "ON_THE_WAY", "IN_PROGRESS"] },
            ...(me.role === "ADMIN" || me.role === "OWNER"
              ? {}
              : { centerId: me.centerId ?? "__none__" }),
          },
          orderBy: { createdAt: "asc" },
          take: 10,
          select: { id: true, ticketNo: true, status: true },
        })
      : [];

    return (
      <StaffChooser
        code={qr.code}
        area={area}
        centre={centre}
        canInspect={canInspect}
        openRequests={openRequests}
      />
    );
  }

  const [types, clients] = await Promise.all([
    prisma.cleaningRequestType.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, group: true, slaMinutes: true },
    }),
    prisma.client.findMany({
      where: { centerId: location.center.id },
      select: { id: true, companyName: true },
      orderBy: { companyName: "asc" },
      take: 500,
    }),
  ]);

  return (
    <ClientRequestForm
      code={qr.code}
      area={area}
      centre={centre}
      types={types}
      clients={clients.map((c) => ({ id: c.id, name: c.companyName }))}
    />
  );
}

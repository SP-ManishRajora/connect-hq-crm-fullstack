import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { CR_STATUS_META, type CrStatus } from "@/lib/housekeeping/requests";
import StatusClient from "./StatusClient";

export const dynamic = "force-dynamic";

// PUBLIC — the unguessable token is the only credential, so this page shows
// progress and nothing else: no assignee name, no internal ids, no other data.
export default async function StatusPage({ params }: { params: { token: string } }) {
  const r = await prisma.cleaningRequest.findUnique({
    where: { statusToken: params.token },
    include: {
      location: { select: { name: true } },
      center: { select: { name: true } },
      events: { orderBy: { createdAt: "asc" }, select: { toStatus: true, createdAt: true } },
    },
  });
  if (!r) notFound();

  return (
    <StatusClient
      token={params.token}
      data={JSON.parse(JSON.stringify({
        ticketNo: r.ticketNo,
        type: r.typeNameSnapshot,
        area: r.location?.name ?? null,
        centre: r.center.name,
        status: r.status,
        statusLabel: CR_STATUS_META[r.status as CrStatus]?.client ?? r.status,
        priority: r.priority,
        createdAt: r.createdAt,
        dueAt: r.dueAt,
        completedAt: r.completedAt,
        confirmation: r.confirmation,
        rating: r.rating,
        progress: r.events.map((e) => ({
          status: e.toStatus,
          label: CR_STATUS_META[e.toStatus as CrStatus]?.client ?? e.toStatus,
          at: e.createdAt,
        })),
      }))}
    />
  );
}

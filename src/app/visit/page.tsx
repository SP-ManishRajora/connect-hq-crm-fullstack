import { prisma } from "@/lib/db";
import VisitForm from "./VisitForm";

export const dynamic = "force-dynamic";

// PUBLIC — reception check-in. No login, and none is created: a visitor confirms
// an email they control and their arrival is recorded against a Visitor row.
export default async function VisitPage({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const centers = await prisma.center.findMany({
    where: { active: true },
    select: { id: true, name: true, city: true },
    orderBy: { name: "asc" },
  });

  const preselected =
    searchParams.centerId && centers.some((c) => c.id === searchParams.centerId)
      ? searchParams.centerId
      : centers.length === 1
        ? centers[0].id
        : "";

  return <VisitForm centers={centers} preselectedCenterId={preselected} />;
}

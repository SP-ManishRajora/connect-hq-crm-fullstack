import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import QRClient from "./QRClient";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: { centerId: string } }) {
  const center = await prisma.center.findUnique({ where: { id: params.centerId } });
  if (!center) return notFound();
  const notices = await prisma.notice.findMany({
    where: { OR: [{ centerId: center.id }, { centerId: null }] },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  return <QRClient center={JSON.parse(JSON.stringify(center))} notices={JSON.parse(JSON.stringify(notices))} />;
}

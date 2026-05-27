import { prisma } from "@/lib/db";
import ReferralsClient from "./ReferralsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [refs, clients] = await Promise.all([
    prisma.referral.findMany({ orderBy: { createdAt: "desc" }, include: { referrer: true, convertedClient: true } }),
    prisma.client.findMany({ where: { active: true } }),
  ]);
  return <ReferralsClient initial={JSON.parse(JSON.stringify(refs))} clients={JSON.parse(JSON.stringify(clients))} />;
}

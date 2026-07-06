import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import ReferralsClient from "./ReferralsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const [u, refs, clients] = await Promise.all([
    getSessionUser(),
    prisma.referral.findMany({ orderBy: { createdAt: "desc" }, include: { referrer: true, convertedClient: true } }),
    prisma.client.findMany({ where: { active: true } }),
  ]);
  const canManage = !!u && ["ADMIN", "OWNER", "SALES"].includes(u.role);
  return <ReferralsClient initial={JSON.parse(JSON.stringify(refs))} clients={JSON.parse(JSON.stringify(clients))} canManage={canManage} />;
}

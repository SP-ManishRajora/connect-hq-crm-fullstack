import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ContractsInbox from "./ContractsInbox";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!["ADMIN", "OWNER", "ACCOUNTS"].includes(me.role)) return <div className="card">Accounts / Admin only.</div>;

  const clients = await prisma.client.findMany({
    where: { active: true },
    include: { center: true, contract: true },
    orderBy: { createdAt: "desc" },
  });

  const needsContract = clients.filter((c) => !c.contract || !c.contract.filePath);
  const withContract = clients.filter((c) => c.contract && c.contract.filePath);
  return (
    <ContractsInbox
      needsContract={JSON.parse(JSON.stringify(needsContract))}
      withContract={JSON.parse(JSON.stringify(withContract))}
    />
  );
}

import { prisma } from "@/lib/db";
import SopsClient from "./SopsClient";
export const dynamic = "force-dynamic";

export default async function Page() {
  const sops = await prisma.sop.findMany({ orderBy: { createdAt: "desc" } });
  return <SopsClient initial={JSON.parse(JSON.stringify(sops))} />;
}

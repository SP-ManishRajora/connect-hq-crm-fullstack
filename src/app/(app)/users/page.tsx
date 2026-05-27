import { prisma } from "@/lib/db";
import UsersClient from "./UsersClient";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN" && me.role !== "OWNER") return <div className="card">Admin/Owner access only.</div>;
  const [users, centers] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, include: { center: true } }),
    prisma.center.findMany(),
  ]);
  return <UsersClient users={JSON.parse(JSON.stringify(users))} centers={JSON.parse(JSON.stringify(centers))} />;
}

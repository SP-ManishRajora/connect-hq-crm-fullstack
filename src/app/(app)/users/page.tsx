import { prisma } from "@/lib/db";
import UsersClient from "./UsersClient";
import { getSessionUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ALL_MODULES, MODULE_ACCESS } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (me.role !== "ADMIN" && me.role !== "OWNER") return <div className="card">Admin/Owner access only.</div>;
  const [users, centers, invites, resets] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: { center: true, transferredTo: { select: { id: true, name: true } } },
    }),
    prisma.center.findMany(),
    prisma.userInvite.findMany({ orderBy: { createdAt: "desc" }, include: { invitedBy: { select: { name: true } } } }),
    prisma.passwordResetRequest.findMany({ orderBy: { createdAt: "desc" }, take: 30, include: { user: { select: { name: true, email: true } } } }),
  ]);
  return (
    <UsersClient
      users={JSON.parse(JSON.stringify(users))}
      centers={JSON.parse(JSON.stringify(centers))}
      invites={JSON.parse(JSON.stringify(invites))}
      resets={JSON.parse(JSON.stringify(resets))}
      allModules={ALL_MODULES}
      defaultByRole={MODULE_ACCESS}
    />
  );
}

import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { parseAllowedModules } from "@/lib/rbac";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  // allowedModules is stored as a JSON string on the session; parse to string[] for the sidebar.
  const shellUser = { ...user, allowedModules: parseAllowedModules(user.allowedModules) };
  return <Shell user={shellUser}>{children}</Shell>;
}

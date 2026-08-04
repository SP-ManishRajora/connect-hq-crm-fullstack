import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { parseAllowedModules } from "@/lib/rbac";
import { modulesForRole } from "@/lib/roles";
import Shell from "@/components/Shell";
import InstallPrompt from "@/components/InstallPrompt";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // Resolve the sidebar's module list here rather than in Shell.tsx, which is a
  // client component and cannot reach the database.
  //
  // Order matters: a per-user override always wins; otherwise we take the role's
  // modules from the AppRole table, which falls back to the hard-coded
  // MODULE_ACCESS when the row is missing or the database is unreachable. This
  // is what makes a custom role — one that rbac.ts has never heard of — actually
  // grant access instead of silently showing an empty sidebar.
  const override = parseAllowedModules(user.allowedModules);
  const allowedModules = override?.length ? override : await modulesForRole(user.role);

  return (
    <Shell user={{ ...user, allowedModules }}>
      {children}
      {/* Offered only to signed-in staff — never on the public login or QR pages. */}
      <InstallPrompt />
    </Shell>
  );
}

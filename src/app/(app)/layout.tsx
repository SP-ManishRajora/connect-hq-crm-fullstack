import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Shell from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <Shell user={user}>{children}</Shell>;
}

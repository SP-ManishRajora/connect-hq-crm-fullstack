"use client";
import { useRouter } from "next/navigation";
export default function RevisionBtn({ id }: { id: string }) {
  const router = useRouter();
  async function run() {
    await fetch(`/api/contracts/${id}/revise`, { method: "POST" });
    router.refresh();
  }
  return <button className="btn-ghost text-xs" onClick={run}>Apply revision</button>;
}

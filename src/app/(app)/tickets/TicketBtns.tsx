"use client";
import { useRouter } from "next/navigation";
export default function TicketBtns({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  async function set(newStatus: string) {
    await fetch(`/api/tickets/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: newStatus }) });
    router.refresh();
  }
  if (status === "RESOLVED") return null;
  return (
    <div className="space-x-1">
      {status === "OPEN" && <button className="btn-ghost text-xs" onClick={() => set("IN_PROGRESS")}>Start</button>}
      <button className="btn-ghost text-xs" onClick={() => set("RESOLVED")}>Resolve</button>
    </div>
  );
}

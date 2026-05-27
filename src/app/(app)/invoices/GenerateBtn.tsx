"use client";
import { useRouter } from "next/navigation";
export default function GenerateBtn() {
  const router = useRouter();
  async function run() {
    const r = await fetch("/api/invoices/run-monthly", { method: "POST" });
    const j = await r.json();
    alert(`Generated ${j.created || 0} invoices`);
    router.refresh();
  }
  return <button className="btn-primary" onClick={run}>Generate this month</button>;
}

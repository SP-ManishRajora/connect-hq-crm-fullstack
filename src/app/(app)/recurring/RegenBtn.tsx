"use client";
import { useRouter } from "next/navigation";
export default function RegenBtn() {
  const router = useRouter();
  async function run() {
    const r = await fetch("/api/po/run-recurring", { method: "POST" });
    const j = await r.json();
    alert(`Regenerated ${j.created || 0} recurring POs`);
    router.refresh();
  }
  return <button className="btn-primary" onClick={run}>Run cycle now</button>;
}

"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtINR } from "@/lib/utils";

export default function ContractsInbox({ needsContract, withContract }: any) {
  const router = useRouter();

  async function uploadFor(clientId: string, file: File) {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "contracts");
    const u = await fetch("/api/upload", { method: "POST", body: fd });
    if (!u.ok) { alert("Upload failed"); return; }
    const { path } = await u.json();
    const r = await fetch(`/api/clients/${clientId}/contract-upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path }) });
    if (r.ok) { alert("Contract attached. OCR scheduled."); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="h1">Contracts Inbox</h1>
        <p className="muted">Accounts uploads the signed contract for each client. Renewals can be uploaded from the client page — old versions auto-archive.</p>
      </div>

      <div className="card">
        <h2 className="h2">Awaiting contract ({needsContract.length})</h2>
        <div className="overflow-x-auto mt-2">
          <table className="table">
            <thead><tr><th>Company</th><th>Center</th><th>Start</th><th>Monthly</th><th>Upload</th></tr></thead>
            <tbody>
              {needsContract.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-medium"><Link href={`/clients/${c.id}`} className="text-brand-700 hover:underline">{c.companyName}</Link></td>
                  <td>{c.center.name}</td>
                  <td>{fmtDate(c.startDate)}</td>
                  <td>{c.contract ? fmtINR(c.contract.monthlyRent) : "—"}</td>
                  <td>
                    <input type="file" accept="application/pdf,image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) await uploadFor(c.id, f); (e.target as HTMLInputElement).value = ""; }} />
                  </td>
                </tr>
              ))}
              {needsContract.length === 0 && <tr><td colSpan={5} className="text-center text-emerald-700 py-6">✅ Every active client has a contract on file</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">On file ({withContract.length})</h2>
        <div className="overflow-x-auto mt-2">
          <table className="table">
            <thead><tr><th>Company</th><th>Center</th><th>Start</th><th>Revision date</th><th></th></tr></thead>
            <tbody>
              {withContract.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-medium"><Link href={`/clients/${c.id}`} className="text-brand-700 hover:underline">{c.companyName}</Link></td>
                  <td>{c.center.name}</td>
                  <td>{fmtDate(c.contract.startDate)}</td>
                  <td>{fmtDate(c.contract.revisionDate)}</td>
                  <td><a href={c.contract.filePath} target="_blank" className="text-brand-600 text-xs">View</a></td>
                </tr>
              ))}
              {withContract.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6">No contracts on file yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

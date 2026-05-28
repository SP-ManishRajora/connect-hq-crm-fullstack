"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtINR } from "@/lib/utils";

export default function ClientsClient({ initial, acceptedProposals, centers }: any) {
  const router = useRouter();
  const [showOnboard, setShowOnboard] = useState(false);
  const [proposalId, setProposalId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [startDate, setStartDate] = useState<string>("");
  const [special, setSpecial] = useState("");
  const [incrementPct, setIncrementPct] = useState(5);
  const [occupiedSeats, setOccupiedSeats] = useState<number | "">("");

  async function onboard(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ proposalId, companyName, contactName, email, phone, startDate, specialAgreement: special, incrementPct, occupiedSeats: occupiedSeats || undefined }),
    });
    if (r.ok) {
      const c = await r.json();
      setShowOnboard(false);
      router.push(`/clients/${c.id}`);
    } else {
      const j = await r.json();
      alert(j.error || "Failed");
    }
  }

  async function sendOps(id: string) { await fetch(`/api/clients/${id}/send-ops`, { method: "POST" }); router.refresh(); }
  async function confirmCM(id: string) { await fetch(`/api/clients/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side: "CM" }) }); router.refresh(); }
  async function confirmClient(id: string) { await fetch(`/api/clients/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side: "CLIENT" }) }); router.refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Clients & Onboarding</h1>
        <button className="btn-primary" onClick={() => setShowOnboard(!showOnboard)}>+ Onboard New Client</button>
      </div>

      {showOnboard && (
        <form onSubmit={onboard} className="card space-y-3">
          <h2 className="h2">Onboard from accepted proposal</h2>
          {acceptedProposals.length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2 text-sm">
              No accepted proposals available. To onboard a client, first create a{" "}
              <Link href="/leads" className="underline font-medium">Lead</Link>, then a{" "}
              <Link href="/proposals" className="underline font-medium">Proposal</Link>, and mark it as <strong>ACCEPTED</strong>.
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2"><label className="label">Accepted proposal *</label>
              <select className="input" required value={proposalId} onChange={(e) => setProposalId(e.target.value)} disabled={acceptedProposals.length === 0}>
                <option value="">{acceptedProposals.length === 0 ? "— None available —" : "— Select —"}</option>
                {acceptedProposals.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.lead?.name || "—"} · {p.center.name} · {p.cabin?.name || "Open"} · {p.seats} seats · {fmtINR(p.rentPerSeat)}/seat
                  </option>
                ))}
              </select>
            </div>
            <div><label className="label">Company *</label><input className="input" required value={companyName} onChange={(e) => setCompanyName(e.target.value)} /></div>
            <div><label className="label">Primary Contact *</label><input className="input" required value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
            <div><label className="label">Email *</label><input className="input" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><label className="label">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><label className="label">Start date *</label><input className="input" required type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div><label className="label">Annual increment %</label><input className="input" type="number" step="0.1" value={incrementPct} onChange={(e) => setIncrementPct(Number(e.target.value))} /></div>
            <div><label className="label">Initial occupied seats (out of cabin)</label><input className="input" type="number" value={occupiedSeats} onChange={(e) => setOccupiedSeats(Number(e.target.value))} placeholder="defaults to seats in proposal" /></div>
            <div className="sm:col-span-2"><label className="label">Special agreement / requirements</label>
              <textarea className="input" rows={3} value={special} onChange={(e) => setSpecial(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowOnboard(false)}>Cancel</button>
            <button className="btn-primary">Create Client + Contract</button>
          </div>
        </form>
      )}

      <div className="card">
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Company</th><th>Contact</th><th>Center</th><th>Cabin</th><th>Occ/Total</th><th>Start</th><th>Sent Ops</th><th>CM ✓</th><th>Client ✓</th><th></th></tr></thead>
            <tbody>
              {initial.map((c: any) => (
                <tr key={c.id}>
                  <td className="font-medium"><Link href={`/clients/${c.id}`} className="text-brand-700 hover:underline">{c.companyName}</Link></td>
                  <td>{c.contactName}<div className="text-xs text-gray-500">{c.email}</div></td>
                  <td>{c.center?.name}</td>
                  <td>{c.cabin?.name || "Open"}</td>
                  <td>{c.occupiedSeats || 0}/{c.totalCabinSeats || c.proposal?.seats || 0}</td>
                  <td>{fmtDate(c.startDate)}</td>
                  <td>{c.sentToOps ? "✅" : <button className="btn-ghost text-xs" onClick={() => sendOps(c.id)}>Send</button>}</td>
                  <td>{c.cmConfirmed ? "✅" : <button className="btn-ghost text-xs" onClick={() => confirmCM(c.id)}>CM</button>}</td>
                  <td>{c.clientConfirmed ? "✅" : <button className="btn-ghost text-xs" onClick={() => confirmClient(c.id)}>Client</button>}</td>
                  <td><Link href={`/clients/${c.id}`} className="text-brand-600 text-xs">Open →</Link></td>
                </tr>
              ))}
              {initial.length === 0 && <tr><td colSpan={10} className="text-center text-gray-400 py-8">No clients</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

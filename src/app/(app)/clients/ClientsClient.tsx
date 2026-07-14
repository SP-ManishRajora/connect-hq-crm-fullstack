"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDate, fmtINR } from "@/lib/utils";

export default function ClientsClient({ initial, acceptedProposals, centers = [], cabins = [] }: any) {
  const router = useRouter();

  // Bulk import (Excel) state.
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFile, setBulkFile] = useState<File | null>(null);
  const [bulkCenterId, setBulkCenterId] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkPreview, setBulkPreview] = useState<any>(null);
  const [bulkResult, setBulkResult] = useState<any>(null);

  async function runBulk(dryRun: boolean) {
    if (!bulkFile) { alert("Choose a file"); return; }
    if (!bulkCenterId) { alert("Select a center"); return; }
    setBulkBusy(true);
    const fd = new FormData();
    fd.append("file", bulkFile);
    fd.append("centerId", bulkCenterId);
    if (dryRun) fd.append("dryRun", "1");
    const r = await fetch("/api/clients/bulk-import", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setBulkBusy(false);
    if (!r.ok) { alert(j.error || "Import failed"); return; }
    if (dryRun) { setBulkPreview(j); setBulkResult(null); }
    else { setBulkResult(j); setBulkPreview(null); router.refresh(); }
  }

  function resetBulk() {
    setShowBulk(false); setBulkFile(null); setBulkCenterId("");
    setBulkPreview(null); setBulkResult(null);
  }

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

  // Direct onboarding (no lead/proposal): manual center/cabin + commercial terms.
  const [showDirect, setShowDirect] = useState(false);
  const [d, setD] = useState<any>({
    companyName: "", contactName: "", email: "", phone: "",
    centerId: "", cabinId: "", startDate: "",
    monthlyRent: "", securityDeposit: "", incrementPct: 5,
    occupiedSeats: "", special: "",
  });
  const cabinsForCenter = cabins.filter((c: any) => c.centerId === d.centerId);

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

  async function onboardDirect(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/clients/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: d.companyName, contactName: d.contactName, email: d.email, phone: d.phone,
        centerId: d.centerId, cabinId: d.cabinId || null, startDate: d.startDate || undefined,
        monthlyRent: d.monthlyRent, securityDeposit: d.securityDeposit, incrementPct: d.incrementPct,
        occupiedSeats: d.occupiedSeats === "" ? undefined : Number(d.occupiedSeats),
        specialAgreement: d.special,
      }),
    });
    if (r.ok) {
      const c = await r.json();
      setShowDirect(false);
      router.push(`/clients/${c.id}`);
    } else {
      const j = await r.json();
      alert(j.error || "Failed");
    }
  }

  // Compose-email popup before sending to a client.
  const [mailFor, setMailFor] = useState<any>(null); // the client being emailed, or null
  const [mailSubject, setMailSubject] = useState("");
  const [mailBody, setMailBody] = useState("");
  const [mailBusy, setMailBusy] = useState(false);

  function openSendMail(c: any) {
    if (!c.email) { alert("This client has no email address."); return; }
    setMailFor(c);
    setMailSubject(`Welcome to ${c.center?.name || "our center"} — onboarding`);
    setMailBody(
      `Dear ${c.contactName || c.companyName},\n\n` +
      `Welcome aboard! Your onboarding at ${c.center?.name || "our center"} is being processed.\n` +
      `Start date: ${c.startDate ? fmtDate(c.startDate) : "—"}\n` +
      `Seats: ${c.occupiedSeats || 0}\n\n` +
      `Our team will reach out with the next steps. Please reply to this email with any questions.\n\n` +
      `Regards,\nTeam Coworking ERP`,
    );
  }

  async function sendMailNow() {
    if (!mailFor) return;
    if (!mailSubject.trim() || !mailBody.trim()) { alert("Subject and body are required."); return; }
    setMailBusy(true);
    const r = await fetch(`/api/clients/${mailFor.id}/send-ops`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: mailSubject.trim(), body: mailBody.trim() }),
    });
    setMailBusy(false);
    if (r.ok) { setMailFor(null); router.refresh(); }
    else { const j = await r.json().catch(() => ({})); alert(j.error || "Failed to send"); }
  }
  async function confirmCM(id: string) { await fetch(`/api/clients/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side: "CM" }) }); router.refresh(); }
  async function confirmClient(id: string) { await fetch(`/api/clients/${id}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ side: "CLIENT" }) }); router.refresh(); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="h1">Clients & Onboarding</h1>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => { setShowBulk(true); setShowDirect(false); setShowOnboard(false); }}>⬆ Bulk upload</button>
          <button type="button" className="btn-ghost" onClick={() => { setShowDirect(!showDirect); setShowOnboard(false); }}>+ New Client (direct)</button>
          <button type="button" className="btn-primary" onClick={() => { setShowOnboard(!showOnboard); setShowDirect(false); }}>+ Onboard from Proposal</button>
        </div>
      </div>

      {/* Compose email to client (review/edit before sending) */}
      {mailFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !mailBusy && setMailFor(null)}>
          <div className="card w-full max-w-lg space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="h2">Send email to client</h2>
              <button type="button" className="btn-ghost text-sm" onClick={() => setMailFor(null)} disabled={mailBusy}>✕</button>
            </div>
            <div>
              <label className="label">To</label>
              <input className="input bg-gray-50" value={mailFor.email} readOnly title="Recipient" />
              <p className="muted text-xs mt-1">{mailFor.companyName}{mailFor.center?.name ? ` · ${mailFor.center.name}` : ""}</p>
            </div>
            <div>
              <label className="label">Subject *</label>
              <input className="input" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} title="Subject" />
            </div>
            <div>
              <label className="label">Message *</label>
              <textarea className="input" rows={9} value={mailBody} onChange={(e) => setMailBody(e.target.value)} title="Message body" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setMailFor(null)} disabled={mailBusy}>Cancel</button>
              <button type="button" className="btn-primary disabled:opacity-50" disabled={mailBusy || !mailSubject.trim() || !mailBody.trim()} onClick={sendMailNow}>
                {mailBusy ? "Sending…" : "Send email"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <div className="card space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="h2">Bulk upload clients (Excel)</h2>
            <button type="button" className="btn-ghost text-sm" onClick={resetBulk}>Close</button>
          </div>
          <p className="muted text-sm">
            Upload the <code>ConnecthqCollectionAndCashExpense.xlsx</code> format. All sheets are scanned; rows with a valid email + company become clients. Choose the center these clients belong to.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Center *</label>
              <select className="input" value={bulkCenterId} onChange={(e) => setBulkCenterId(e.target.value)} title="Center">
                <option value="">— Select —</option>
                {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Excel file (.xlsx) *</label>
              <input className="input" type="file" accept=".xlsx,.xls" title="Excel file"
                onChange={(e) => { setBulkFile(e.target.files?.[0] || null); setBulkPreview(null); setBulkResult(null); }} />
            </div>
          </div>

          {bulkPreview && (
            <div className="rounded-md border border-blue-200 bg-blue-50 text-blue-900 px-3 py-2 text-sm space-y-1">
              <div><strong>Preview:</strong> {bulkPreview.willCreate} will be created · {bulkPreview.alreadyExists} already exist · {bulkPreview.totalParsed} rows parsed.</div>
              {bulkPreview.sample?.length > 0 && (
                <div className="text-xs">Sample: {bulkPreview.sample.map((s: any) => `${s.company} (${s.seats}×₹${s.rate})`).join(", ")}</div>
              )}
              {bulkPreview.skippedSheets?.length > 0 && (
                <div className="text-xs text-blue-700">Skipped sheets: {bulkPreview.skippedSheets.map((s: any) => s.sheet).join(", ")}</div>
              )}
            </div>
          )}

          {bulkResult && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 text-emerald-900 px-3 py-2 text-sm space-y-1">
              <div><strong>Imported {bulkResult.created} client(s).</strong> {bulkResult.alreadyExists} already existed (skipped).</div>
              {bulkResult.errors?.length > 0 && <div className="text-xs text-rose-700">{bulkResult.errors.length} failed: {bulkResult.errors.slice(0, 3).map((e: any) => e.email).join(", ")}…</div>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost disabled:opacity-50" disabled={bulkBusy || !bulkFile || !bulkCenterId} onClick={() => runBulk(true)}>
              {bulkBusy ? "…" : "Preview"}
            </button>
            <button type="button" className="btn-primary disabled:opacity-50" disabled={bulkBusy || !bulkFile || !bulkCenterId} onClick={() => runBulk(false)}>
              {bulkBusy ? "Importing…" : "Import"}
            </button>
          </div>
        </div>
      )}

      {showDirect && (
        <form onSubmit={onboardDirect} className="card space-y-3">
          <h2 className="h2">New client — direct onboarding (no lead/proposal)</h2>
          <p className="muted text-sm">Enter the client and commercial terms manually. A contract is created automatically.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Company *</label><input className="input" required value={d.companyName} onChange={(e) => setD({ ...d, companyName: e.target.value })} /></div>
            <div><label className="label">Primary Contact *</label><input className="input" required value={d.contactName} onChange={(e) => setD({ ...d, contactName: e.target.value })} /></div>
            <div><label className="label">Email *</label><input className="input" required type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></div>
            <div><label className="label">Center *</label>
              <select className="input" required title="Center" value={d.centerId} onChange={(e) => setD({ ...d, centerId: e.target.value, cabinId: "" })}>
                <option value="">— Select —</option>
                {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="label">Cabin (optional)</label>
              <select className="input" title="Cabin" value={d.cabinId} onChange={(e) => setD({ ...d, cabinId: e.target.value })} disabled={!d.centerId}>
                <option value="">— Open / none —</option>
                {cabinsForCenter.map((c: any) => <option key={c.id} value={c.id}>{c.name} ({c.capacity} seats)</option>)}
              </select>
            </div>
            <div><label className="label">Start date</label><input className="input" type="date" title="Start date" value={d.startDate} onChange={(e) => setD({ ...d, startDate: e.target.value })} /></div>
            <div><label className="label">Monthly rent (₹) *</label><input className="input" required type="number" min="0" value={d.monthlyRent} onChange={(e) => setD({ ...d, monthlyRent: e.target.value })} /></div>
            <div><label className="label">Security deposit (₹)</label><input className="input" type="number" min="0" value={d.securityDeposit} onChange={(e) => setD({ ...d, securityDeposit: e.target.value })} /></div>
            <div><label className="label">Annual increment %</label><input className="input" type="number" step="0.1" value={d.incrementPct} onChange={(e) => setD({ ...d, incrementPct: Number(e.target.value) })} /></div>
            <div><label className="label">Occupied seats</label><input className="input" type="number" min="0" value={d.occupiedSeats} onChange={(e) => setD({ ...d, occupiedSeats: e.target.value })} placeholder="defaults to cabin capacity" /></div>
            <div className="sm:col-span-2"><label className="label">Special agreement / requirements</label>
              <textarea className="input" rows={3} value={d.special} onChange={(e) => setD({ ...d, special: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => setShowDirect(false)}>Cancel</button>
            <button type="submit" className="btn-primary">Create Client + Contract</button>
          </div>
        </form>
      )}

      {showOnboard && (
        <form onSubmit={onboard} className="card space-y-3">
          <h2 className="h2">Onboard from accepted proposal (lead-based)</h2>
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
                  <td>{c.occupiedSeats || 0}/{c.totalCabinSeats || 0}</td>
                  <td>{fmtDate(c.startDate)}</td>
                  <td>{c.sentToOps ? "✅" : <button className="btn-ghost text-xs" onClick={() => openSendMail(c)}>Send</button>}</td>
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

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const STATUS = ["NEW", "CONTACTED", "TOUR_SCHEDULED", "PROPOSAL_SENT", "NEGOTIATION", "WON", "LOST"];
const CHANNELS = ["CALL", "WHATSAPP", "EMAIL", "INTERNAL"];

export default function LeadDetail({ lead, centers }: any) {
  const router = useRouter();
  const [status, setStatus] = useState(lead.status);
  const [centerId, setCenterId] = useState(lead.centerId || "");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("CALL");

  async function updateLead() {
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, centerId: centerId || null }),
    });
    router.refresh();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch(`/api/leads/${lead.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, channel }),
    });
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-brand-600">← Back to leads</Link>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">{lead.name}</h1>
          <p className="muted">{lead.company} · {lead.phone} · {lead.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/visitors?leadId=${lead.id}`} className="btn-ghost">Add Visitor / KYC</Link>
          <Link href={`/proposals?leadId=${lead.id}`} className="btn-primary">Create Proposal</Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h2 className="h2">Lead Info</h2>
          <div><span className="muted">Source:</span> {lead.source}</div>
          <div><span className="muted">Seats needed:</span> {lead.seatsNeeded || "—"}</div>
          <div><span className="muted">Budget:</span> {lead.budget ? `₹${lead.budget}` : "—"}</div>
          <div><span className="muted">Notes:</span> {lead.notes || "—"}</div>

          <div className="pt-3 border-t">
            <label className="label">Status</label>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Center</label>
            <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">— None —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={updateLead}>Save</button>
        </div>

        <div className="card space-y-3">
          <h2 className="h2">Comments / Activity</h2>
          <form onSubmit={addComment} className="space-y-2">
            <div className="flex gap-2">
              <select className="input max-w-[140px]" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input flex-1" placeholder="Add a note (e.g. WhatsApp message text)" value={body} onChange={(e) => setBody(e.target.value)} />
              <button className="btn-primary">Add</button>
            </div>
            <p className="muted text-xs">WhatsApp messages can be appended via API <code>POST /api/leads/{lead.id}/comments</code> from your WhatsApp webhook.</p>
          </form>

          <div className="space-y-2 pt-2">
            {lead.comments.map((c: any) => (
              <div key={c.id} className="border rounded-md p-2 text-sm">
                <div className="flex justify-between">
                  <span className="badge bg-gray-100 text-gray-700">{c.channel}</span>
                  <span className="muted text-xs">{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                <div className="mt-1">{c.body}</div>
                {c.author && <div className="text-xs text-gray-400 mt-1">by {c.author.name}</div>}
              </div>
            ))}
            {lead.comments.length === 0 && <p className="muted">No comments yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

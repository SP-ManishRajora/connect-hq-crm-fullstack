"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR, fmtDate } from "@/lib/utils";

const CATS = ["COMPLAINT", "REQUEST", "IT", "FACILITY"];

export default function ClientPortal({ user, client, tickets, notices, invoices }: any) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [t, setT] = useState<any>({ category: "COMPLAINT", subject: "", body: "" });
  const [feedback, setFeedback] = useState({ rating: 5, body: "" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...t, clientId: client?.id }) });
    setShow(false);
    router.refresh();
  }
  async function submitFeedback(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...feedback, clientId: client?.id }) });
    setFeedback({ rating: 5, body: "" });
    alert("Thanks for your feedback!");
  }

  return (
    <div className="space-y-4">
      <h1 className="h1">Welcome, {user.name}</h1>
      {client ? (
        <p className="muted">Center: {client.center?.name} · Company: {client.companyName}</p>
      ) : (
        <p className="muted">Note: no client record found for {user.email}. Some features will be limited.</p>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex justify-between items-center"><h2 className="h2">Raise complaint / request</h2><button className="btn-primary" onClick={() => setShow(!show)}>+ New</button></div>
          {show && (
            <form onSubmit={submit} className="mt-3 space-y-2">
              <select className="input" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              <input className="input" placeholder="Subject" required value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
              <textarea className="input" rows={3} placeholder="Describe..." required value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
              <button className="btn-primary">Submit</button>
            </form>
          )}
          <div className="mt-3 space-y-2">
            {tickets.map((x: any) => (
              <div key={x.id} className="border rounded p-2 text-sm">
                <div className="flex justify-between"><span className="font-medium">{x.subject}</span><span className="badge bg-gray-100">{x.status}</span></div>
                <div className="text-xs text-gray-500">{x.category} · {fmtDate(x.createdAt)}</div>
              </div>
            ))}
            {tickets.length === 0 && <p className="muted">No tickets yet</p>}
          </div>
        </div>

        <div className="card">
          <h2 className="h2">Quick feedback</h2>
          <form onSubmit={submitFeedback} className="mt-3 space-y-2">
            <div>
              <label className="label">Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((r) => (
                  <button type="button" key={r} className={`text-2xl ${r <= feedback.rating ? "text-amber-500" : "text-gray-300"}`} onClick={() => setFeedback({ ...feedback, rating: r })}>★</button>
                ))}
              </div>
            </div>
            <textarea className="input" rows={3} placeholder="Tell us..." value={feedback.body} onChange={(e) => setFeedback({ ...feedback, body: e.target.value })} />
            <button className="btn-primary">Submit</button>
          </form>
        </div>
      </div>

      <div className="card">
        <h2 className="h2">Notice board</h2>
        <div className="space-y-2 mt-2">
          {notices.map((n: any) => (
            <div key={n.id} className={`border rounded p-3 text-sm ${n.isAd ? "bg-amber-50" : ""}`}>
              <div className="font-medium">{n.title} {n.isAd && <span className="badge bg-amber-200 text-amber-900 ml-1">Ad: {n.brand}</span>}</div>
              <div className="muted text-xs">{fmtDate(n.createdAt)}</div>
              <p className="mt-1 whitespace-pre-wrap">{n.body}</p>
            </div>
          ))}
          {notices.length === 0 && <p className="muted">No notices</p>}
        </div>
      </div>

      {invoices.length > 0 && (
        <div className="card overflow-x-auto">
          <h2 className="h2">My Invoices</h2>
          <table className="table mt-2">
            <thead><tr><th>Invoice</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.map((i: any) => (
                <tr key={i.id}>
                  <td className="font-mono text-xs">{i.invoiceNo}</td>
                  <td className="text-xs">{fmtDate(i.periodStart)} → {fmtDate(i.periodEnd)}</td>
                  <td>{fmtINR(i.totalAmount)}</td>
                  <td>{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

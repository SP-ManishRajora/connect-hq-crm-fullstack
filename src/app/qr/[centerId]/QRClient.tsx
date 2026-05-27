"use client";
import { useState } from "react";
import { fmtDate } from "@/lib/utils";

const CATS = ["COMPLAINT", "REQUEST", "IT", "FACILITY"];

export default function QRClient({ center, notices }: any) {
  const [tab, setTab] = useState<"NEW" | "FB" | "NOTICE">("NEW");
  const [t, setT] = useState<any>({ category: "COMPLAINT", subject: "", body: "" });
  const [feedback, setFb] = useState<any>({ rating: 5, body: "" });
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tickets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...t }) });
    setDone(true); setT({ category: "COMPLAINT", subject: "", body: "" });
  }
  async function submitFb(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(feedback) });
    setDone(true); setFb({ rating: 5, body: "" });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-4">
          <div className="font-bold text-brand-700 text-xl">{center.name}</div>
          <div className="muted">{center.city}</div>
        </div>
        {done ? (
          <div className="card text-center"><div className="text-4xl mb-2">✅</div><div>Thanks — we've got it!</div><button className="btn-ghost mt-3" onClick={() => setDone(false)}>Send another</button></div>
        ) : (
          <>
            <div className="flex bg-white rounded-md border mb-3">
              <button onClick={() => setTab("NEW")} className={`flex-1 px-3 py-2 text-sm ${tab === "NEW" ? "bg-brand-600 text-white rounded" : ""}`}>Complaint</button>
              <button onClick={() => setTab("FB")} className={`flex-1 px-3 py-2 text-sm ${tab === "FB" ? "bg-brand-600 text-white rounded" : ""}`}>Feedback</button>
              <button onClick={() => setTab("NOTICE")} className={`flex-1 px-3 py-2 text-sm ${tab === "NOTICE" ? "bg-brand-600 text-white rounded" : ""}`}>Notices</button>
            </div>

            {tab === "NEW" && (
              <form onSubmit={submit} className="card space-y-2">
                <select className="input" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
                <input className="input" placeholder="Subject" required value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
                <textarea className="input" rows={3} placeholder="Describe..." required value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} />
                <button className="btn-primary w-full">Submit</button>
              </form>
            )}
            {tab === "FB" && (
              <form onSubmit={submitFb} className="card space-y-2">
                <div className="flex gap-1 justify-center">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button type="button" key={r} className={`text-3xl ${r <= feedback.rating ? "text-amber-500" : "text-gray-300"}`} onClick={() => setFb({ ...feedback, rating: r })}>★</button>
                  ))}
                </div>
                <textarea className="input" rows={3} placeholder="Tell us..." value={feedback.body} onChange={(e) => setFb({ ...feedback, body: e.target.value })} />
                <button className="btn-primary w-full">Submit</button>
              </form>
            )}
            {tab === "NOTICE" && (
              <div className="space-y-2">
                {notices.map((n: any) => (
                  <div key={n.id} className={`card text-sm ${n.isAd ? "bg-amber-50" : ""}`}>
                    <div className="font-medium">{n.title}{n.isAd && <span className="badge bg-amber-200 text-amber-900 ml-1">Ad</span>}</div>
                    <div className="muted text-xs">{fmtDate(n.createdAt)}</div>
                    <p className="mt-1">{n.body}</p>
                  </div>
                ))}
                {notices.length === 0 && <p className="muted">No notices</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

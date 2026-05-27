"use client";
import { useEffect, useState } from "react";

export default function LeadForm() {
  const [centers, setCenters] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ name: "", phone: "", email: "", company: "", seatsNeeded: "", centerId: "", notes: "" });
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch("/api/centers/public").then((r) => r.json()).then(setCenters).catch(() => {});
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/leads/public", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) setDone(true);
    else alert("Failed");
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card max-w-md text-center">
          <div className="text-5xl mb-2">✅</div>
          <h1 className="h1">Thanks!</h1>
          <p className="muted mt-2">We received your enquiry — our team will reach out shortly.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4 flex items-center justify-center">
      <form onSubmit={submit} className="card max-w-lg w-full space-y-3">
        <h1 className="h1">Find your perfect workspace</h1>
        <p className="muted">Tell us a bit about you — we'll get in touch.</p>
        <div><label className="label">Name *</label>
          <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div><label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div><label className="label">Company</label>
          <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="label">Seats needed</label>
            <input className="input" type="number" value={form.seatsNeeded} onChange={(e) => setForm({ ...form, seatsNeeded: e.target.value })} />
          </div>
          <div><label className="label">Preferred center</label>
            <select className="input" value={form.centerId} onChange={(e) => setForm({ ...form, centerId: e.target.value })}>
              <option value="">No preference</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.city}</option>)}
            </select>
          </div>
        </div>
        <div><label className="label">Notes</label>
          <textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        <button className="btn-primary w-full">Submit Enquiry</button>
      </form>
    </div>
  );
}

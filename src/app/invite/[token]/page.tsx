"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AcceptInvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState<string>("");
  const [form, setForm] = useState({ password: "", confirm: "", phone: "", aadhaar: "", pan: "", designation: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch(`/api/invites/${params.token}`).then(async (r) => {
      if (r.ok) setInfo(await r.json()); else setError((await r.json()).error || "Invalid invite");
    });
  }, [params.token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) { setError("Passwords don't match"); return; }
    setSubmitting(true);
    const r = await fetch(`/api/invites/${params.token}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    setSubmitting(false);
    if (r.ok) {
      alert("Account created. You can sign in now.");
      router.push("/login");
    } else { const j = await r.json(); setError(j.error || "Failed"); }
  }

  if (error) return <div className="min-h-screen flex items-center justify-center p-4"><div className="card max-w-md text-center"><div className="text-4xl mb-2">❌</div><p>{error}</p></div></div>;
  if (!info) return <div className="min-h-screen flex items-center justify-center"><p className="muted">Loading invite...</p></div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4 flex items-center justify-center">
      <form onSubmit={submit} className="card max-w-md w-full space-y-3">
        <h1 className="h1">Welcome, {info.name}!</h1>
        <p className="muted">You've been invited as <strong>{info.role}</strong>. Set your password to activate.</p>
        <div><label className="label">Email</label><input className="input" disabled value={info.email} /></div>
        <div><label className="label">New password (min 6 chars) *</label><input className="input" required type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
        <div><label className="label">Confirm password *</label><input className="input" required type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><label className="label">Designation</label><input className="input" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></div>
          <div><label className="label">Aadhaar</label><input className="input" value={form.aadhaar} onChange={(e) => setForm({ ...form, aadhaar: e.target.value })} /></div>
          <div><label className="label">PAN</label><input className="input" value={form.pan} onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })} /></div>
        </div>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button className="btn-primary w-full" disabled={submitting}>{submitting ? "Creating account..." : "Create account"}</button>
      </form>
    </div>
  );
}

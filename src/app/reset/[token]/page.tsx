"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ResetPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirm) { setErr("Passwords don't match"); return; }
    const r = await fetch(`/api/password-resets/use/${params.token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) { alert("Password updated. Please log in."); router.push("/login"); }
    else { const j = await r.json(); setErr(j.error || "Failed"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-white">
      <form onSubmit={submit} className="card max-w-md w-full space-y-3">
        <h1 className="h1">Set new password</h1>
        <div><label className="label">New password (min 6 chars) *</label><input className="input" required type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label">Confirm *</label><input className="input" required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="btn-primary w-full">Update password</button>
      </form>
    </div>
  );
}

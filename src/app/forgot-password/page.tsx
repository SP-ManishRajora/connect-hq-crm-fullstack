"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    if (res.ok) setSent(true);
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Request failed"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Connect HQ" className="mx-auto w-40 h-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Reset your password</h1>
        </div>
        {sent ? (
          <div className="card text-center space-y-3">
            <p className="text-green-700">If an account exists for that email, a reset link has been sent.</p>
            <button className="btn-ghost" onClick={() => router.push("/login")}>Back to login</button>
          </div>
        ) : (
          <form onSubmit={submit} className="card space-y-4">
            <p className="text-sm muted">Enter your email and we'll send you a reset link.</p>
            <div><label className="label">Email</label><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</button>
            <button type="button" className="text-xs text-gray-500 w-full text-center" onClick={() => router.push("/login")}>Back to login</button>
          </form>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@erp.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    setLoading(false);
    if (res.ok) {
      const data = await res.json();
      router.push(data.role === "CLIENT" ? "/client-portal" : "/dashboard");
      router.refresh();
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Login failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-brand-600 text-white font-bold text-2xl rounded-lg px-4 py-2 mb-3">CW</div>
          <h1 className="text-2xl font-bold text-gray-900">Coworking ERP</h1>
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>
        <form onSubmit={submit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {err && <p className="text-red-600 text-sm">{err}</p>}
          <button className="btn-primary w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <div className="mt-6 text-xs text-gray-500 text-center">
          Demo: admin@erp.com / admin123 · sales@erp.com / sales123 · ops@erp.com / ops123
        </div>
      </div>
    </div>
  );
}

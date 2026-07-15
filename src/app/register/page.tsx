"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center muted">Loading…</div>}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") || "";

  const [state, setState] = useState<"loading" | "valid" | "invalid" | "done">("loading");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/api/auth/register?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.valid) { setEmail(d.email); setCompany(d.companyName); setState("valid"); }
        else setState("invalid");
      })
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) return setErr("Passwords do not match");
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    setLoading(false);
    if (res.ok) setState("done");
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Registration failed"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Connect HQ" className="mx-auto w-40 h-auto mb-3" />
          <h1 className="text-2xl font-bold text-gray-900">Set up your account</h1>
        </div>

        {state === "loading" && <div className="card text-center muted">Validating your invite…</div>}

        {state === "invalid" && (
          <div className="card text-center space-y-3">
            <p className="text-red-600">This invite link is invalid or has expired.</p>
            <p className="text-sm muted">Please ask your center manager to send a new invitation.</p>
            <button className="btn-ghost" onClick={() => router.push("/login")}>Go to login</button>
          </div>
        )}

        {state === "done" && (
          <div className="card text-center space-y-3">
            <p className="text-green-700 font-medium">Account created!</p>
            <button className="btn-primary w-full" onClick={() => router.push("/login")}>Continue to sign in</button>
          </div>
        )}

        {state === "valid" && (
          <form onSubmit={submit} className="card space-y-4">
            {company && <p className="text-sm muted">Joining <strong>{company}</strong></p>}
            <div><label className="label">Email</label><input className="input bg-gray-50" value={email} disabled /></div>
            <div><label className="label">Full name</label><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><label className="label">Password</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, letters + numbers" /></div>
            <div><label className="label">Confirm password</label><input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Creating…" : "Create account"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

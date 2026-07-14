"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ResetPasswordPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const token = sp.get("token") || "";

  const [state, setState] = useState<"loading" | "valid" | "invalid" | "done">("loading");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setState("invalid"); return; }
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((d) => setState(d.valid ? "valid" : "invalid"))
      .catch(() => setState("invalid"));
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (password !== confirm) return setErr("Passwords do not match");
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setLoading(false);
    if (res.ok) setState("done");
    else { const j = await res.json().catch(() => ({})); setErr(j.error || "Reset failed"); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-block bg-brand-600 text-white font-bold text-2xl rounded-lg px-4 py-2 mb-3">CW</div>
          <h1 className="text-2xl font-bold text-gray-900">Choose a new password</h1>
        </div>

        {state === "loading" && <div className="card text-center muted">Validating…</div>}

        {state === "invalid" && (
          <div className="card text-center space-y-3">
            <p className="text-red-600">This reset link is invalid or has expired.</p>
            <button className="btn-ghost" onClick={() => router.push("/forgot-password")}>Request a new link</button>
          </div>
        )}

        {state === "done" && (
          <div className="card text-center space-y-3">
            <p className="text-green-700 font-medium">Password updated!</p>
            <button className="btn-primary w-full" onClick={() => router.push("/login")}>Sign in</button>
          </div>
        )}

        {state === "valid" && (
          <form onSubmit={submit} className="card space-y-4">
            <div><label className="label">New password</label><input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars, letters + numbers" /></div>
            <div><label className="label">Confirm password</label><input className="input" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Saving…" : "Update password"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

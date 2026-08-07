"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import PasswordInput from "@/components/PasswordInput";

// Two ways in, deliberately not equivalent:
//   • password — everyone, and the only way for staff
//   • emailed code — client accounts only, enforced server-side
//
// Staff keep a password because their accounts reach payroll, invoices and admin;
// an inbox is a weaker credential than a password for that. The server never says
// which addresses are eligible, so this page cannot be used to probe for accounts.
type Mode = "PASSWORD" | "OTP";
type OtpStep = "EMAIL" | "CODE";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("PASSWORD");
  const [email, setEmail] = useState("admin@erp.com");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [otpStep, setOtpStep] = useState<OtpStep>("EMAIL");
  const [otpEmail, setOtpEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function land(role: string) {
    router.push(role === "CLIENT" ? "/client-portal" : "/dashboard");
    router.refresh();
  }

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
      land((await res.json()).role);
    } else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Login failed");
    }
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setNotice(null); setLoading(true);
    const res = await fetch("/api/auth/otp/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: otpEmail }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setErr(j.error || "Could not send a code"); return; }
    // Deliberately non-committal: the server does not disclose whether an account
    // exists, and neither does this screen.
    setNotice(j.message || "If that address can sign in with a code, we have sent one.");
    setOtpStep("CODE");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const res = await fetch("/api/auth/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: otpEmail, code: otpCode }),
    });
    const j = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) { setErr(j.error || "Could not verify that code"); return; }
    land(j.role);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="Connect HQ" className="mx-auto w-48 h-auto mb-3" />
          <p className="text-sm text-gray-500 mt-1">Sign in to continue</p>
        </div>

        {mode === "PASSWORD" && (
          <form onSubmit={submit} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label">Password</label>
              <PasswordInput value={password} onChange={setPassword} required
                autoComplete="current-password" />
            </div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <a href="/forgot-password" className="block text-center text-xs text-brand-600 hover:underline">
              Forgot password?
            </a>
            <div className="border-t pt-3">
              <button type="button"
                onClick={() => { setMode("OTP"); setErr(null); setOtpEmail(email === "admin@erp.com" ? "" : email); }}
                className="w-full text-center text-sm text-brand-600 hover:underline">
                Client? Sign in with an emailed code
              </button>
            </div>
          </form>
        )}

        {mode === "OTP" && otpStep === "EMAIL" && (
          <form onSubmit={requestCode} className="card space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={otpEmail}
                onChange={(e) => setOtpEmail(e.target.value)}
                placeholder="you@company.com" required autoFocus />
              <p className="mt-1 text-xs text-gray-500">
                We&apos;ll email you a code. No password needed.
              </p>
            </div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading || !otpEmail.trim()}>
              {loading ? "Sending…" : "Email me a code"}
            </button>
            <button type="button" onClick={() => { setMode("PASSWORD"); setErr(null); setNotice(null); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
              ← Sign in with a password
            </button>
          </form>
        )}

        {mode === "OTP" && otpStep === "CODE" && (
          <form onSubmit={verifyCode} className="card space-y-4">
            {notice && (
              <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>
            )}
            <div>
              <label className="label">Code</label>
              <input className="input text-center font-mono text-2xl tracking-widest"
                value={otpCode} inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
              <p className="mt-1 text-xs text-gray-500">
                Sent to {otpEmail}. It expires in 10 minutes.
              </p>
            </div>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button className="btn-primary w-full" disabled={loading || otpCode.length < 6}>
              {loading ? "Verifying…" : "Sign in"}
            </button>
            <button type="button"
              onClick={() => { setOtpStep("EMAIL"); setOtpCode(""); setErr(null); setNotice(null); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700">
              ← Use a different address
            </button>
          </form>
        )}

        <div className="mt-6 text-xs text-gray-500 text-center">
          Demo: admin@erp.com / admin123 · sales@erp.com / sales123 · ops@erp.com / ops123
        </div>
      </div>
    </div>
  );
}

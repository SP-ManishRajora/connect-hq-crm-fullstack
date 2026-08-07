"use client";
import { useState } from "react";

type Centre = { id: string; name: string; city: string };
type Step = "DETAILS" | "CODE" | "DONE";

// Reception check-in. Details first, then one emailed code to confirm the address
// is real — no account is created and nothing here signs anybody in.
export default function VisitForm({
  centers, preselectedCenterId,
}: {
  centers: Centre[];
  preselectedCenterId: string;
}) {
  const [step, setStep] = useState<Step>("DETAILS");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [purpose, setPurpose] = useState("");
  const [centerId, setCenterId] = useState(preselectedCenterId);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(body: unknown) {
    const r = await fetch("/api/visitors/self", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post({ action: "REQUEST", email, centerId: centerId || null });
      setStep("CODE");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      await post({
        action: "VERIFY", email, code, name,
        phone: phone || null, purpose: purpose || null,
        centerId: centerId || null,
      });
      setStep("DONE");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="mx-auto max-w-md">
        <header className="pt-6 pb-5 text-center">
          <img src="/logo.png" alt="Connect HQ" className="mx-auto mb-3 h-auto w-40" />
          <p className="text-sm text-gray-500">Visitor check-in</p>
        </header>

        {err && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}

        {step === "DETAILS" && (
          <form onSubmit={requestCode} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold">Welcome</h1>
            <p className="-mt-1 pb-1 text-sm text-gray-500">
              Tell us who you are. We&apos;ll email a code to confirm your address.
            </p>

            {centers.length > 1 && (
              <div>
                <label className="label">Centre</label>
                <select className="input" value={centerId} required
                  onChange={(e) => setCenterId(e.target.value)}>
                  <option value="">Select a centre…</option>
                  {centers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} — {c.city}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Your name</label>
              <input className="input" value={name} required maxLength={120}
                onChange={(e) => setName(e.target.value)} placeholder="Full name" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} required maxLength={160}
                onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <label className="label">Mobile <span className="text-gray-400">(optional)</span></label>
              <input className="input" value={phone} maxLength={20} inputMode="numeric"
                onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="label">Who are you visiting? <span className="text-gray-400">(optional)</span></label>
              <input className="input" value={purpose} maxLength={500}
                onChange={(e) => setPurpose(e.target.value)} placeholder="Person or company" />
            </div>

            <button className="btn-primary w-full" disabled={busy || !name.trim() || !email.trim()}>
              {busy ? "Sending…" : "Continue"}
            </button>
          </form>
        )}

        {step === "CODE" && (
          <form onSubmit={verify} className="space-y-3 rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold">Enter the code</h1>
            <p className="-mt-1 text-sm text-gray-500">
              Emailed to <strong>{email}</strong>. It expires in 10 minutes.
            </p>
            <input
              className="input text-center font-mono text-2xl tracking-widest"
              value={code} inputMode="numeric" maxLength={6} placeholder="000000" autoFocus
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
            <button className="btn-primary w-full" disabled={busy || code.length < 6}>
              {busy ? "Checking in…" : "Check in"}
            </button>
            <button type="button" onClick={() => { setStep("DETAILS"); setCode(""); setErr(null); }}
              className="w-full py-2 text-center text-sm text-gray-500 hover:text-gray-700">
              ← Change my details
            </button>
          </form>
        )}

        {step === "DONE" && (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <div className="mb-3 text-5xl">✅</div>
            <h1 className="mb-1 text-lg font-semibold">You&apos;re checked in</h1>
            <p className="text-sm text-gray-500">
              Thanks, {name}. Please head to reception — they know you have arrived.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

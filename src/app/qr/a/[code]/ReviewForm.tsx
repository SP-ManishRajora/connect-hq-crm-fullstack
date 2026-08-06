"use client";
import { useMemo, useState } from "react";

type C = { id: string; name: string };
type Step = "CONTACT" | "CODE" | "REVIEW" | "DONE";

// Verified review flow, reached from the area sticker.
//
// The passcode proves the reviewer controls the number they typed — enough to
// make a review attributable and to keep casual spam out. It deliberately does
// NOT prove employment: the company below is self-declared, exactly as it is on
// the request form, and the server records it as unverified.
export default function ReviewForm({
  code, area, centre, clients, onCancel,
}: {
  code: string;
  area: { name: string; floor: string | null; category: string };
  centre: { name: string; city: string };
  clients: C[];
  onCancel?: () => void;
}) {
  const [step, setStep] = useState<Step>("CONTACT");
  const [channel, setChannel] = useState<"SMS" | "EMAIL">("SMS");
  const [destination, setDestination] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpId, setOtpId] = useState("");
  const [verifiedDestination, setVerifiedDestination] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [reviewerName, setReviewerName] = useState("");
  const [clientId, setClientId] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [search, setSearch] = useState("");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [search, clients]);

  async function post(url: string, body: unknown) {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Something went wrong.");
    return j;
  }

  async function requestCode() {
    setBusy(true); setErr(null); setNotice(null);
    try {
      const j = await post("/api/housekeeping/reviews/request-otp", {
        code, destination, channel,
      });
      setOtpId(j.otpId);
      setDevCode(j.devCode ?? null);
      // Told plainly rather than leaving someone waiting for a message that was
      // never sent — no SMS gateway is configured yet.
      if (!j.delivered) {
        setNotice(
          j.devCode
            ? `No SMS gateway is configured, so the code is shown below for testing.`
            : `We could not deliver the code (${j.deliveryNote || "sending failed"}). Try email instead.`,
        );
      }
      setStep("CODE");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setErr(null);
    try {
      const j = await post("/api/housekeeping/reviews/verify-otp", {
        destination, code: otpCode, channel,
      });
      setOtpId(j.otpId);
      setVerifiedDestination(j.destination);
      setStep("REVIEW");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  async function submit() {
    if (!rating) { setErr("Choose a rating from 1 to 5."); return; }
    setBusy(true); setErr(null);
    try {
      await post("/api/housekeeping/reviews/public", {
        code, otpId, destination: verifiedDestination, channel,
        rating, comment: comment || null,
        reviewerName: reviewerName || null,
        clientId: clientId || null,
        companyName: clientId ? null : companyName || null,
      });
      setStep("DONE");
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-white p-4">
      <div className="max-w-md mx-auto">
        <header className="text-center mb-5 pt-4">
          <div className="text-xl font-bold text-brand-700">{centre.name}</div>
          <div className="text-sm text-gray-500">
            {area.name}{area.floor ? ` · ${area.floor}` : ""}
          </div>
        </header>

        {err && <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>}
        {notice && (
          <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{notice}</div>
        )}

        {/* ---------- 1. contact ---------- */}
        {step === "CONTACT" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold mb-1">Leave a review</h1>
            <p className="text-sm text-gray-500 mb-4">
              We&apos;ll send a one-time code to confirm it&apos;s really you.
            </p>

            <div className="mb-3 flex gap-2">
              {(["SMS", "EMAIL"] as const).map((ch) => (
                <button key={ch}
                  onClick={() => { setChannel(ch); setDestination(""); setErr(null); }}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm transition ${
                    channel === ch ? "border-brand-500 bg-brand-50 font-medium" : "hover:bg-gray-50"}`}>
                  {ch === "SMS" ? "📱 Mobile" : "✉️ Email"}
                </button>
              ))}
            </div>

            <input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              inputMode={channel === "SMS" ? "numeric" : "email"}
              maxLength={160}
              placeholder={channel === "SMS" ? "10-digit mobile number" : "you@company.com"}
              className="w-full rounded-lg border px-3 py-2.5 text-sm mb-4"
            />

            <button onClick={requestCode} disabled={busy || !destination.trim()}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-white font-medium disabled:opacity-40">
              {busy ? "Sending…" : "Send code"}
            </button>
            {onCancel && (
              <button onClick={onCancel} className="w-full mt-2 text-sm text-gray-500 py-2">
                ← Back
              </button>
            )}
          </div>
        )}

        {/* ---------- 2. code ---------- */}
        {step === "CODE" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold mb-1">Enter the code</h1>
            <p className="text-sm text-gray-500 mb-4">
              Sent to <strong>{destination}</strong>. It expires in 10 minutes.
            </p>

            {devCode && (
              <div className="mb-3 rounded-lg bg-gray-100 p-3 text-center">
                <div className="text-[11px] uppercase tracking-wider text-gray-500">Test code</div>
                <div className="font-mono text-2xl font-semibold tracking-widest">{devCode}</div>
              </div>
            )}

            <input
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric" maxLength={6} placeholder="000000"
              className="w-full rounded-lg border px-3 py-3 text-center font-mono text-2xl tracking-widest mb-4"
            />

            <button onClick={verify} disabled={busy || otpCode.length < 6}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-white font-medium disabled:opacity-40">
              {busy ? "Verifying…" : "Verify"}
            </button>
            <button onClick={() => { setStep("CONTACT"); setOtpCode(""); setDevCode(null); setNotice(null); }}
              className="w-full mt-2 text-sm text-gray-500 py-2">
              ← Use a different {channel === "SMS" ? "number" : "address"}
            </button>
          </div>
        )}

        {/* ---------- 3. review ---------- */}
        {step === "REVIEW" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="mb-4 rounded-lg bg-emerald-50 p-2.5 text-center text-sm text-emerald-800">
              ✓ Verified as {verifiedDestination}
            </div>

            <h1 className="text-lg font-semibold mb-1">How was {area.name}?</h1>
            <p className="text-sm text-gray-500 mb-4">Your rating helps us keep it right.</p>

            <div className="mb-4 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} star${n > 1 ? "s" : ""}`}
                  className={`text-4xl transition ${n <= rating ? "grayscale-0" : "grayscale opacity-30"}`}>
                  ⭐
                </button>
              ))}
            </div>

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Your company <span className="text-gray-400">(optional)</span>
            </label>
            {clients.length > 8 && (
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your company…"
                className="w-full rounded-lg border px-3 py-2 text-sm mb-2" />
            )}
            <div className="mb-2 max-h-40 space-y-1.5 overflow-y-auto">
              {filtered.map((c) => (
                <button key={c.id}
                  onClick={() => { setClientId(clientId === c.id ? "" : c.id); setCompanyName(""); }}
                  className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                    clientId === c.id ? "border-brand-500 bg-brand-50 font-medium" : "hover:bg-gray-50"}`}>
                  {c.name}
                </button>
              ))}
            </div>
            {!clientId && (
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} maxLength={160}
                placeholder="Or type your company / leave blank if a guest"
                className="w-full rounded-lg border px-3 py-2.5 text-sm mb-3" />
            )}

            <textarea value={comment} onChange={(e) => setComment(e.target.value)}
              rows={3} maxLength={2000}
              placeholder="Tell us more (optional)"
              className="w-full rounded-lg border px-3 py-2.5 text-sm mb-3" />

            <input value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} maxLength={120}
              placeholder="Your name (optional)"
              className="w-full rounded-lg border px-3 py-2.5 text-sm mb-4" />

            <button onClick={submit} disabled={busy || !rating}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-white font-medium disabled:opacity-40">
              {busy ? "Posting…" : "Post review"}
            </button>
          </div>
        )}

        {/* ---------- 4. done ---------- */}
        {step === "DONE" && (
          <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
            <div className="mb-3 text-5xl">🙏</div>
            <h1 className="text-lg font-semibold mb-1">Thank you</h1>
            <p className="text-sm text-gray-500">
              Your review for {area.name} has been recorded.
            </p>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-gray-400">
          {centre.name} · {centre.city}
        </p>
      </div>
    </div>
  );
}

"use client";
import { useMemo, useState } from "react";

type T = { id: string; name: string; group: string; slaMinutes: number };
type C = { id: string; name: string };

// Brief §35 — the action screen shown after the company is chosen.
const ACTIONS = [
  { key: "CLEANING",    label: "Request Cleaning",          icon: "🧹", group: "CLEANING" },
  { key: "CONSUMABLE",  label: "Request Consumable Refill", icon: "🧴", group: "CONSUMABLE" },
  { key: "CLEANLINESS", label: "Report Cleanliness Problem", icon: "⚠️", slug: "r-cleanliness" },
  { key: "MAINTENANCE", label: "Report Maintenance Problem", icon: "🔧", slug: "r-maintenance" },
  { key: "SAFETY",      label: "Report Safety Issue",        icon: "🚨", slug: "r-safety" },
  { key: "FEEDBACK",    label: "Give Feedback",              icon: "💬", slug: "r-feedback" },
] as const;

type Step = "COMPANY" | "ACTION" | "DETAIL" | "DONE";

export default function ClientRequestForm({
  code, area, centre, types, clients,
}: {
  code: string;
  area: { name: string; floor: string | null; category: string };
  centre: { name: string; city: string };
  types: T[];
  clients: C[];
}) {
  const [step, setStep] = useState<Step>("COMPANY");
  const [clientId, setClientId] = useState("");
  const [search, setSearch] = useState("");
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [typeId, setTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ ticketNo: string; statusUrl: string; etaMinutes: number; priority: string } | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? clients.filter((c) => c.name.toLowerCase().includes(q)) : clients;
  }, [search, clients]);

  // Which request types belong to the chosen action.
  const options = useMemo(() => {
    if (!action) return [];
    if ("group" in action && action.group) return types.filter((t) => t.group === action.group);
    if ("slug" in action && action.slug) {
      const t = types.find((x) => x.name.toLowerCase().includes(action.label.toLowerCase().split(" ").slice(-1)[0]));
      return t ? [t] : types.filter((x) => x.group === "REPORT");
    }
    return [];
  }, [action, types]);

  function chooseAction(a: (typeof ACTIONS)[number]) {
    setAction(a);
    setErr(null);
    // Report/feedback actions have exactly one type — skip the picker.
    if (!("group" in a) || !a.group) {
      const reports = types.filter((t) => t.group === "REPORT");
      const match =
        a.key === "CLEANLINESS" ? reports.find((t) => t.name.includes("cleanliness"))
        : a.key === "MAINTENANCE" ? reports.find((t) => t.name.includes("maintenance"))
        : a.key === "SAFETY" ? reports.find((t) => t.name.includes("safety"))
        : reports.find((t) => t.name.includes("feedback"));
      setTypeId(match?.id ?? "");
    } else {
      setTypeId("");
    }
    setStep("DETAIL");
  }

  async function submit() {
    if (!typeId) { setErr("Please choose what you need."); return; }
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/housekeeping/requests/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code, typeId, clientId: clientId || null,
          description: description || null,
          clientName: name || null, clientPhone: phone || null,
          priority: urgent ? "URGENT" : "NORMAL",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not submit your request.");
      setDone(j);
      setStep("DONE");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
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

        {err && (
          <div className="mb-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{err}</div>
        )}

        {/* ---------- 1. company ---------- */}
        {step === "COMPANY" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold mb-1">Welcome</h1>
            <p className="text-sm text-gray-500 mb-4">Select your company to continue.</p>

            {clients.length > 8 && (
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search your company…"
                className="w-full rounded-lg border px-3 py-2.5 text-sm mb-3"
              />
            )}

            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {filtered.map((c) => (
                <button key={c.id}
                  onClick={() => { setClientId(c.id); setStep("ACTION"); }}
                  className="w-full text-left rounded-lg border px-4 py-3 text-sm hover:bg-brand-50 hover:border-brand-300 transition">
                  {c.name}
                </button>
              ))}
              {filtered.length === 0 && (
                <div className="py-6 text-center text-sm text-gray-500">No matching company.</div>
              )}
            </div>

            <button onClick={() => setStep("ACTION")}
              className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 py-2">
              Skip — I&apos;m a guest
            </button>
          </div>
        )}

        {/* ---------- 2. action ---------- */}
        {step === "ACTION" && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold mb-1">How can we assist you?</h1>
            <p className="text-sm text-gray-500 mb-4">{area.name}</p>
            <div className="space-y-2">
              {ACTIONS.map((a) => (
                <button key={a.key} onClick={() => chooseAction(a)}
                  className="w-full flex items-center gap-3 rounded-xl border px-4 py-4 text-left hover:bg-brand-50 hover:border-brand-300 transition">
                  <span className="text-2xl">{a.icon}</span>
                  <span className="font-medium text-sm">{a.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setStep("COMPANY")}
              className="w-full mt-3 text-sm text-gray-500 py-2">← Back</button>
          </div>
        )}

        {/* ---------- 3. detail ---------- */}
        {step === "DETAIL" && action && (
          <div className="rounded-2xl border bg-white p-5 shadow-sm">
            <h1 className="text-lg font-semibold mb-1">{action.label}</h1>
            <p className="text-sm text-gray-500 mb-4">{area.name}</p>

            {options.length > 1 && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-2">What do you need?</label>
                <div className="grid grid-cols-2 gap-2">
                  {options.map((t) => (
                    <button key={t.id} onClick={() => setTypeId(t.id)}
                      className={`rounded-lg border px-3 py-2.5 text-xs text-left transition ${
                        typeId === t.id ? "border-brand-500 bg-brand-50 font-medium" : "hover:bg-gray-50"}`}>
                      {t.name}
                      <div className="text-[10px] text-gray-400 mt-0.5">~{t.slaMinutes} min</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="block text-xs font-medium text-gray-600 mb-1">
              Anything we should know? <span className="text-gray-400">(optional)</span>
            </label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} maxLength={1000}
              placeholder="e.g. water spilled near the entrance"
              className="w-full rounded-lg border px-3 py-2.5 text-sm mb-3" />

            <label className="flex items-center gap-2 mb-4 cursor-pointer">
              <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)}
                className="rounded" />
              <span className="text-sm">This is urgent</span>
            </label>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120}
                placeholder="Your name (optional)" className="rounded-lg border px-3 py-2.5 text-sm" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20}
                placeholder="Mobile (optional)" className="rounded-lg border px-3 py-2.5 text-sm" />
            </div>

            <button onClick={submit} disabled={busy || !typeId}
              className="w-full rounded-xl bg-brand-600 py-3.5 text-white font-medium disabled:opacity-40">
              {busy ? "Submitting…" : "Submit request"}
            </button>
            <button onClick={() => setStep("ACTION")} className="w-full mt-2 text-sm text-gray-500 py-2">
              ← Back
            </button>
          </div>
        )}

        {/* ---------- 4. done ---------- */}
        {step === "DONE" && done && (
          <div className="rounded-2xl border bg-white p-6 shadow-sm text-center">
            <div className="text-5xl mb-3">✅</div>
            <h1 className="text-lg font-semibold mb-1">Request received</h1>
            <p className="text-sm text-gray-500 mb-4">
              Our housekeeping team has been notified.
            </p>

            <div className="rounded-xl bg-gray-50 p-4 mb-4 text-left">
              <Row label="Reference" value={done.ticketNo} mono />
              <Row label="Area" value={area.name} />
              <Row label="Expected within" value={`${done.etaMinutes} minutes`} />
              {done.priority === "URGENT" && (
                <div className="mt-2 rounded bg-amber-100 px-2 py-1 text-xs text-amber-900 text-center">
                  Marked urgent — prioritised
                </div>
              )}
            </div>

            <a href={done.statusUrl}
              className="block rounded-xl bg-brand-600 py-3 text-white font-medium mb-2">
              Track this request
            </a>
            <button onClick={() => { setStep("ACTION"); setDone(null); setDescription(""); setUrgent(false); setTypeId(""); }}
              className="w-full text-sm text-gray-500 py-2">
              Raise another request
            </button>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">
          {centre.name} · {centre.city}
        </p>
      </div>
    </div>
  );
}

function Row({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-gray-500">{label}</span>
      <span className={mono ? "font-mono font-medium" : "font-medium"}>{value}</span>
    </div>
  );
}

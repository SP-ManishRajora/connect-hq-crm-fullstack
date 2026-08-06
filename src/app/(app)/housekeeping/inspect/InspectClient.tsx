"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import QrScanner from "./QrScanner";
import AiReview from "./AiReview";
import { getDeviceId, getPosition, analyseImage, type Fix } from "@/lib/housekeeping/client-capture";
import { FLAG_LABELS } from "@/lib/housekeeping/types";

type Center = { id: string; name: string; city: string };
type Round = { id: string; centerId: string; status: string; startedAt: string };
type Visit = { id: string; locationId: string; sequence: number; status: string };
type Loc = {
  id: string; name: string; category: string;
  requiredPhotoCount: number; minDwellSeconds: number; checklist: string[];
};

type Slot = {
  angle: string;
  file: File | null;
  preview: string | null;
  photoId: string | null;   // server id, used to attach a photo to a raised issue
  uploading: boolean;
  uploaded: boolean;
  problems: string[];
  duplicate: { kind: string; locationName: string } | null;
  error: string | null;
};

type Step = "IDLE" | "SCANNING" | "CAPTURING";

const ISSUE_CATEGORIES = ["cleanliness", "maintenance", "safety", "consumables", "presentation"];
const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export default function InspectClient({
  centers,
  activeRound,
  defaultCenterId,
  pendingCode = null,
}: {
  centers: Center[];
  activeRound: Round | null;
  defaultCenterId: string | null;
  /** Code carried over from the area sticker; scanned once a round is open. */
  pendingCode?: string | null;
}) {
  const [round, setRound] = useState<Round | null>(activeRound);
  const [centerId, setCenterId] = useState(defaultCenterId || centers[0]?.id || "");
  const [step, setStep] = useState<Step>("IDLE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "warn" | "err"; text: string } | null>(null);

  const [visit, setVisit] = useState<Visit | null>(null);
  const [loc, setLoc] = useState<Loc | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [scanFlags, setScanFlags] = useState<string[]>([]);
  const [distanceM, setDistanceM] = useState<number | null>(null);
  const [observations, setObservations] = useState("");
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [done, setDone] = useState<{ name: string }[]>([]);

  // Raise-issue panel (Phase 6) — a problem spotted during the round becomes a
  // tracked issue immediately, with a captured photo attached as before-evidence.
  const [issueOpen, setIssueOpen] = useState(false);
  const [issue, setIssue] = useState({
    title: "", category: "cleanliness", severity: "MEDIUM" as (typeof SEVERITIES)[number], slot: -1,
  });
  const [raised, setRaised] = useState<string[]>([]);

  const fixRef = useRef<Fix>(null);

  // Dwell timer — ticks only while capturing, so the supervisor can see whether
  // they've spent the minimum time at the area.
  useEffect(() => {
    if (step !== "CAPTURING") return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [step]);

  const dwell = scannedAt ? Math.floor((now - scannedAt) / 1000) : 0;
  const dwellOk = loc ? dwell >= loc.minDwellSeconds : false;

  async function startRound() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/housekeeping/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ centerId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not start the round");
      setRound(j);
      setMsg({ kind: "ok", text: j.resumed ? "Resumed your open round." : "Round started." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const handleScan = useCallback(
    async (code: string) => {
      if (!round) return;
      setBusy(true);
      setMsg(null);
      setStep("IDLE");
      try {
        const fix = await getPosition();
        fixRef.current = fix;

        const r = await fetch("/api/housekeeping/visits", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roundId: round.id,
            code,
            lat: fix?.lat ?? null,
            lng: fix?.lng ?? null,
            accuracyM: fix?.accuracyM ?? null,
            deviceId: getDeviceId(),
          }),
        });
        const j = await r.json();
        if (!r.ok) {
          setMsg({ kind: "err", text: j.error || "Scan rejected" });
          return;
        }

        setVisit(j.visit);
        setLoc(j.location);
        setScanFlags(j.flags || []);
        setDistanceM(j.distanceM);
        setScannedAt(Date.now());
        setNow(Date.now());
        setObservations("");
        setSlots(
          (j.requiredAngles as string[]).map((angle) => ({
            angle, file: null, preview: null, photoId: null, uploading: false,
            uploaded: false, problems: [], duplicate: null, error: null,
          })),
        );
        setStep("CAPTURING");
      } catch (e: any) {
        setMsg({ kind: "err", text: e.message || "Scan failed" });
      } finally {
        setBusy(false);
      }
    },
    [round],
  );

  // Arriving from the area sticker with ?code=… — submit it as soon as a round is
  // open. It still goes through /api/housekeeping/visits with a live GPS fix, so
  // the geofence and dwell rules apply exactly as for a camera scan; the sticker
  // only saves the supervisor from scanning the same code twice. The ref makes
  // this fire once, so a rejected scan is not retried on every render.
  const consumedCodeRef = useRef(false);
  useEffect(() => {
    if (!pendingCode || !round || consumedCodeRef.current) return;
    consumedCodeRef.current = true;
    handleScan(pendingCode);
  }, [pendingCode, round, handleScan]);

  async function onPick(idx: number, file: File | null) {
    if (!file || !visit) return;
    setSlots((s) => s.map((x, i) => (i === idx ? { ...x, uploading: true, error: null } : x)));

    const quality = await analyseImage(file);
    const preview = URL.createObjectURL(file);

    const fd = new FormData();
    fd.set("file", file);
    fd.set("visitId", visit.id);
    fd.set("slot", String(idx));
    fd.set("angle", slots[idx].angle);
    fd.set("captureAt", new Date(file.lastModified || Date.now()).toISOString());
    fd.set("deviceId", getDeviceId());
    fd.set("qualityScore", String(quality.score));
    if (quality.pHash) fd.set("pHash", quality.pHash);
    if (fixRef.current) {
      fd.set("lat", String(fixRef.current.lat));
      fd.set("lng", String(fixRef.current.lng));
    }

    try {
      const r = await fetch("/api/housekeeping/photos", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Upload failed");

      setSlots((s) =>
        s.map((x, i) =>
          i === idx
            ? {
                ...x, file, preview, photoId: j.id, uploading: false, uploaded: true,
                problems: quality.problems, duplicate: j.duplicate, error: null,
              }
            : x,
        ),
      );
    } catch (e: any) {
      setSlots((s) =>
        s.map((x, i) =>
          i === idx ? { ...x, uploading: false, uploaded: false, error: e.message } : x,
        ),
      );
    }
  }

  async function raiseIssue() {
    if (!visit || !loc || !round || issue.title.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      // Attach the chosen photo (if any) as the issue's before-evidence.
      const photoId = issue.slot >= 0 ? slots[issue.slot]?.photoId ?? null : null;
      const r = await fetch("/api/housekeeping/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          centerId: round.centerId,
          locationId: loc.id,
          visitId: visit.id,
          category: issue.category,
          title: issue.title.trim(),
          severity: issue.severity,
          beforePhotoId: photoId,
          source: "INSPECTION",
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not raise the issue");

      setRaised((x) => [...x, j.title]);
      setIssue({ title: "", category: "cleanliness", severity: "MEDIUM", slot: -1 });
      setIssueOpen(false);
      setMsg({
        kind: j.autoEscalated ? "warn" : "ok",
        text: j.autoEscalated
          ? `Issue raised and auto-escalated to CRITICAL — it describes a hazard.`
          : `Issue raised: "${j.title}".`,
      });
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function submitVisit() {
    if (!visit) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`/api/housekeeping/visits/${visit.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ observations: observations || null }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Submit failed");

      setDone((d) => [...d, { name: loc!.name }]);
      setMsg({
        kind: j.tooFast ? "warn" : "ok",
        text: j.tooFast
          ? `${loc!.name} submitted, but flagged: completed in ${j.dwellSeconds}s (minimum ${j.minDwellSeconds}s).`
          : `${loc!.name} submitted.`,
      });
      resetArea();
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  function resetArea() {
    slots.forEach((s) => s.preview && URL.revokeObjectURL(s.preview));
    setVisit(null); setLoc(null); setSlots([]); setScanFlags([]);
    setDistanceM(null); setScannedAt(null); setStep("IDLE");
    setIssueOpen(false); setRaised([]);
    setIssue({ title: "", category: "cleanliness", severity: "MEDIUM", slot: -1 });
  }

  async function completeRound() {
    if (!round) return;
    if (!confirm("Complete this inspection round?")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/housekeeping/rounds/${round.id}/complete`, { method: "POST" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not complete the round");
      setMsg({
        kind: "ok",
        text: `Round complete — ${j.submitted} of ${j.totalLocations} areas inspected${j.missed ? `, ${j.missed} missed` : ""}.`,
      });
      setRound(null);
      setDone([]);
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message });
    } finally {
      setBusy(false);
    }
  }

  const uploadedCount = slots.filter((s) => s.uploaded).length;
  const allCaptured = slots.length > 0 && uploadedCount >= slots.length;

  return (
    <div className="max-w-2xl pb-24">
      <h1 className="text-2xl font-semibold mb-1">📸 Inspections</h1>
      <p className="text-sm text-gray-500 mb-5">
        Scan the QR at each area, capture the required photographs, and submit.
      </p>

      {msg && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm ${
            msg.kind === "ok" ? "bg-emerald-50 text-emerald-800"
            : msg.kind === "warn" ? "bg-amber-50 text-amber-900"
            : "bg-rose-50 text-rose-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {/* ---------- No active round ---------- */}
      {!round && (
        <div className="rounded-xl border bg-white p-5">
          <div className="font-medium mb-3">Start an inspection round</div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Centre</label>
          <select
            value={centerId}
            onChange={(e) => setCenterId(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm mb-4"
          >
            {centers.map((c) => (
              <option key={c.id} value={c.id}>{c.name} — {c.city}</option>
            ))}
          </select>
          <button
            onClick={startRound}
            disabled={busy || !centerId}
            className="w-full rounded-lg bg-brand-600 py-3 text-white font-medium disabled:opacity-40"
          >
            {busy ? "Starting…" : "Start round"}
          </button>
        </div>
      )}

      {/* ---------- Active round ---------- */}
      {round && (
        <>
          <div className="rounded-xl border bg-white p-4 mb-4 flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">Round in progress</div>
              <div className="font-medium">
                {centers.find((c) => c.id === round.centerId)?.name ?? "Centre"}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {done.length} area{done.length === 1 ? "" : "s"} submitted this session
              </div>
            </div>
            <button
              onClick={completeRound}
              disabled={busy}
              className="rounded-md border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Complete round
            </button>
          </div>

          {step === "IDLE" && (
            <button
              onClick={() => setStep("SCANNING")}
              disabled={busy}
              className="w-full rounded-xl bg-brand-600 py-6 text-white text-lg font-medium disabled:opacity-40"
            >
              {busy ? "Working…" : "🔳  Scan area QR code"}
            </button>
          )}

          {step === "SCANNING" && (
            <QrScanner onScan={handleScan} onCancel={() => setStep("IDLE")} />
          )}

          {/* ---------- Capturing ---------- */}
          {step === "CAPTURING" && loc && (
            <div className="space-y-4">
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{loc.name}</div>
                    <div className="text-xs text-gray-500">{loc.category.replace(/_/g, " ")}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-medium ${dwellOk ? "text-emerald-600" : "text-amber-600"}`}>
                      {Math.floor(dwell / 60)}:{String(dwell % 60).padStart(2, "0")}
                    </div>
                    <div className="text-[10px] text-gray-500">min {loc.minDwellSeconds}s</div>
                  </div>
                </div>

                {distanceM != null && (
                  <div className="mt-2 text-xs text-gray-600">
                    📍 {Math.round(distanceM)} m from the recorded point
                  </div>
                )}

                {scanFlags.length > 0 && (
                  <div className="mt-3 rounded-md bg-amber-50 p-2.5">
                    <div className="text-xs font-medium text-amber-900 mb-1">Flagged for review</div>
                    <ul className="text-xs text-amber-800 space-y-0.5">
                      {scanFlags.map((f) => <li key={f}>• {FLAG_LABELS[f] ?? f}</li>)}
                    </ul>
                  </div>
                )}

                {loc.checklist.length > 0 && (
                  <ul className="mt-3 text-xs text-gray-600 space-y-1">
                    {loc.checklist.map((c) => <li key={c}>☐ {c}</li>)}
                  </ul>
                )}
              </div>

              {/* progress */}
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${(uploadedCount / slots.length) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 tabular-nums">
                  {uploadedCount}/{slots.length}
                </span>
              </div>

              {slots.map((s, i) => (
                <div key={i} className="rounded-xl border bg-white p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium">
                      {i + 1}. {s.angle}
                    </div>
                    {s.uploaded && <span className="text-xs text-emerald-600">✓ captured</span>}
                  </div>

                  {s.preview && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.preview} alt={s.angle} className="w-full rounded-lg mb-2 max-h-56 object-cover" />
                  )}

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={s.uploading}
                    onChange={(e) => onPick(i, e.target.files?.[0] ?? null)}
                    className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-600 file:px-4 file:py-2 file:text-white"
                  />

                  {s.uploading && <div className="mt-2 text-xs text-gray-500">Uploading…</div>}
                  {s.error && <div className="mt-2 text-xs text-rose-700">{s.error}</div>}

                  {s.problems.map((p) => (
                    <div key={p} className="mt-2 text-xs text-amber-800 bg-amber-50 rounded p-2">
                      ⚠ {p} — tap above to retake.
                    </div>
                  ))}

                  {s.duplicate && (
                    <div className="mt-2 text-xs text-rose-800 bg-rose-50 rounded p-2">
                      ⚠ This photograph {s.duplicate.kind === "EXACT" ? "is identical to" : "looks very similar to"} one
                      already submitted for <strong>{s.duplicate.locationName}</strong>. It has been flagged for review.
                    </div>
                  )}
                </div>
              ))}

              {/* ---- AI findings review (Phase 5) ---- */}
              <AiReview
                visitId={visit!.id}
                photoIds={slots.filter((s) => s.photoId).map((s) => s.photoId!) as string[]}
              />

              {/* ---- raise an issue for this area ---- */}
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Problems found?</div>
                    <div className="text-xs text-gray-500">
                      Raise a tracked issue so it gets assigned and verified.
                    </div>
                  </div>
                  <button
                    onClick={() => setIssueOpen((v) => !v)}
                    className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
                  >
                    {issueOpen ? "Close" : "+ Issue"}
                  </button>
                </div>

                {raised.length > 0 && (
                  <ul className="mt-2 text-xs text-emerald-700 space-y-0.5">
                    {raised.map((t, n) => <li key={n}>✓ {t}</li>)}
                  </ul>
                )}

                {issueOpen && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    <input
                      value={issue.title}
                      onChange={(e) => setIssue({ ...issue, title: e.target.value })}
                      placeholder="e.g. Handwash dispenser empty"
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap gap-2">
                      <select
                        value={issue.category}
                        onChange={(e) => setIssue({ ...issue, category: e.target.value })}
                        className="rounded-md border px-2 py-2 text-sm"
                      >
                        {ISSUE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <select
                        value={issue.severity}
                        onChange={(e) => setIssue({ ...issue, severity: e.target.value as any })}
                        className="rounded-md border px-2 py-2 text-sm"
                      >
                        {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      <select
                        value={issue.slot}
                        onChange={(e) => setIssue({ ...issue, slot: Number(e.target.value) })}
                        className="rounded-md border px-2 py-2 text-sm"
                      >
                        <option value={-1}>— attach photo —</option>
                        {slots.map((s, n) => s.uploaded ? <option key={n} value={n}>{n + 1}. {s.angle}</option> : null)}
                      </select>
                    </div>
                    <button
                      onClick={raiseIssue}
                      disabled={busy || issue.title.trim().length < 3}
                      className="w-full rounded-md bg-gray-800 py-2 text-sm text-white disabled:opacity-40"
                    >
                      Raise issue
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-white p-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Observations (optional)
                </label>
                <textarea
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  rows={3}
                  placeholder="Anything the photographs don't show…"
                  className="w-full rounded-md border px-3 py-2 text-sm"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={resetArea}
                  className="rounded-lg border px-4 py-3 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={submitVisit}
                  disabled={busy || !allCaptured}
                  className="flex-1 rounded-lg bg-brand-600 py-3 text-white font-medium disabled:opacity-40"
                >
                  {busy
                    ? "Submitting…"
                    : allCaptured
                      ? "Submit this area"
                      : `Capture all ${slots.length} photographs`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

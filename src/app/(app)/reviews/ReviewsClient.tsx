"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtDateTime } from "@/lib/utils";
import { reviewSchema } from "@/lib/reviewSchema";
import { isValidIndianPhone, isValidEmail } from "@/lib/validators";

type Review = {
  id: string;
  name: string;
  phoneNumber: string;
  companyName: string;
  email: string | null;
  feedback: string;
  isVisitor: boolean;
  purposeOfVisit: string | null;
  createdAt: string;
  createdBy?: { name: string } | null;
};

const EMPTY = {
  name: "",
  phoneNumber: "",
  companyName: "",
  email: "",
  feedback: "",
  isVisitor: false,
  purposeOfVisit: "",
};

// Red required marker used on mandatory field labels.
const Req = () => <span className="text-red-600"> *</span>;

export default function ReviewsClient({ initial }: { initial: Review[] }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<typeof EMPTY>({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<"all" | "visitor" | "client">("all");

  const rows = useMemo(() => {
    if (filter === "visitor") return initial.filter((r) => r.isVisitor);
    if (filter === "client") return initial.filter((r) => !r.isVisitor);
    return initial;
  }, [initial, filter]);

  function set<K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: "" } : e));
  }

  // Debounced ("on stop typing") validation for phone and email. Fires ~500ms
  // after the last keystroke so we don't nag mid-typing.
  useEffect(() => {
    const t = setTimeout(() => {
      const v = form.phoneNumber.trim();
      setErrors((e) => ({
        ...e,
        phoneNumber: v && !isValidIndianPhone(v) ? "Enter a valid phone number" : "",
      }));
    }, 500);
    return () => clearTimeout(t);
  }, [form.phoneNumber]);

  useEffect(() => {
    const t = setTimeout(() => {
      const v = form.email.trim();
      setErrors((e) => ({
        ...e,
        email: v && !isValidEmail(v) ? "Enter a valid email" : "",
      }));
    }, 500);
    return () => clearTimeout(t);
  }, [form.email]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    // Client-side validation using the SAME schema the server enforces.
    const parsed = reviewSchema.safeParse(form);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "_");
        if (!fe[key]) fe[key] = issue.message;
      }
      setErrors(fe);
      return;
    }

    setSaving(true);
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) {
        setForm({ ...EMPTY });
        setShow(false);
        router.refresh();
      } else if (data?.fieldErrors) {
        setErrors(data.fieldErrors);
      } else {
        setErrors({ _: data?.error || "Failed to submit" });
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    const r = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
    if (r.ok) router.refresh();
    else alert("Failed to delete");
  }

  const err = (k: string) =>
    errors[k] ? <p className="text-xs text-red-600 mt-1">{errors[k]}</p> : null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <h1 className="h1">Reviews / Feedback</h1>
        <button className="btn-primary" onClick={() => setShow((s) => !s)}>
          {show ? "Close" : "+ Add Feedback"}
        </button>
      </div>

      {show && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3" noValidate>
          {errors._ && (
            <div className="sm:col-span-2 text-sm text-red-600">{errors._}</div>
          )}

          <div>
            <label className="label">Name<Req /></label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
            {err("name")}
          </div>

          <div>
            <label className="label">Phone Number<Req /></label>
            <input
              className="input"
              inputMode="tel"
              value={form.phoneNumber}
              onChange={(e) => set("phoneNumber", e.target.value)}
            />
            {err("phoneNumber")}
          </div>

          <div>
            <label className="label">Company Name{!form.isVisitor && <Req />}</label>
            <input
              className="input"
              value={form.companyName}
              onChange={(e) => set("companyName", e.target.value)}
            />
            {err("companyName")}
          </div>

          <div>
            <label className="label">Email</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
            {err("email")}
          </div>

          <div className="sm:col-span-2">
            <label className="label">
              {form.isVisitor ? "Visitor Feedback" : "Feedback / Review"}
              <Req />
            </label>
            <textarea
              className="input"
              rows={3}
              value={form.feedback}
              onChange={(e) => set("feedback", e.target.value)}
            />
            {err("feedback")}
          </div>

          <div className="sm:col-span-2 flex items-center gap-2">
            <input
              id="isVisitor"
              type="checkbox"
              checked={form.isVisitor}
              onChange={(e) => set("isVisitor", e.target.checked)}
            />
            <label htmlFor="isVisitor" className="text-sm">
              This person is a visitor
            </label>
          </div>

          {form.isVisitor && (
            <div className="sm:col-span-2">
              <label className="label">
                Purpose of Visit<Req />
              </label>
              <input
                className="input"
                value={form.purposeOfVisit}
                onChange={(e) => set("purposeOfVisit", e.target.value)}
              />
              {err("purposeOfVisit")}
            </div>
          )}

          <div className="sm:col-span-2 flex justify-end gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                setShow(false);
                setErrors({});
              }}
            >
              Cancel
            </button>
            <button className="btn-primary" disabled={saving}>
              {saving ? "Saving…" : "Submit Feedback"}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-2 flex-wrap">
        {(["all", "client", "visitor"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`badge ${
              filter === f ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"
            }`}
          >
            {f === "all" ? "All" : f === "client" ? "Clients" : "Visitors"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div className="flex justify-between items-start gap-2">
              <div>
                <h3 className="font-semibold">{r.name}</h3>
                <p className="muted text-xs">{r.companyName}</p>
              </div>
              <span
                className={`badge ${
                  r.isVisitor
                    ? "bg-amber-100 text-amber-900"
                    : "bg-emerald-100 text-emerald-900"
                }`}
              >
                {r.isVisitor ? "Visitor" : "Client"}
              </span>
            </div>

            <p className="text-sm mt-2 whitespace-pre-wrap">{r.feedback}</p>

            {r.isVisitor && r.purposeOfVisit && (
              <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs">
                <p>
                  <span className="font-medium">Purpose:</span> {r.purposeOfVisit}
                </p>
              </div>
            )}

            <p className="muted text-xs mt-2">
              📞 {r.phoneNumber}
              {r.email ? ` · ✉️ ${r.email}` : ""}
            </p>
            <div className="flex justify-between items-center mt-2">
              <p className="muted text-xs">
                {fmtDateTime(r.createdAt)}
                {r.createdBy?.name ? ` · by ${r.createdBy.name}` : ""}
              </p>
              <button
                onClick={() => remove(r.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="muted">No feedback yet</p>}
      </div>
    </div>
  );
}

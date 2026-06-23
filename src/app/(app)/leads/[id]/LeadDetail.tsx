"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { allowedNextStatuses } from "@/lib/leadStatus";
import { fmtDateTime } from "@/lib/utils";

const CHANNELS = ["CALL", "WHATSAPP", "EMAIL", "INTERNAL"];

export default function LeadDetail({ lead, centers }: any) {
  const router = useRouter();
  const [centerId, setCenterId] = useState(lead.centerId || "");
  const [body, setBody] = useState("");
  const [channel, setChannel] = useState("CALL");

  // Inline comment editing: which comment is open, its draft body, and which have history expanded.
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [savingComment, setSavingComment] = useState(false);
  const [showHistory, setShowHistory] = useState<Record<string, boolean>>({});

  function startEditComment(c: any) {
    setEditingComment(c.id);
    setCommentDraft(c.body);
  }

  async function saveEditComment(commentId: string) {
    if (!commentDraft.trim()) return;
    setSavingComment(true);
    const res = await fetch(`/api/leads/${lead.id}/comments/${commentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentDraft.trim() }),
    });
    setSavingComment(false);
    if (res.ok) {
      setEditingComment(null);
      setCommentDraft("");
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  // Status change: select shows the current status (default) plus every other status.
  // Picking a different status reveals the required-comment box.
  const nextOptions = allowedNextStatuses(lead.status);
  const statusOptions = [lead.status, ...nextOptions];
  const [nextStatus, setNextStatus] = useState(lead.status);
  const [statusComment, setStatusComment] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);
  const statusChanged = nextStatus !== lead.status;

  async function upgradeStatus() {
    if (!nextStatus || !statusComment.trim()) return;
    setSavingStatus(true);
    const res = await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus, comment: statusComment.trim() }),
    });
    setSavingStatus(false);
    if (res.ok) {
      setStatusComment("");
      router.refresh();
    } else {
      const detail = await res.json().catch(() => ({}));
      alert(`Failed (${res.status}): ${detail.error || res.statusText}`);
    }
  }

  async function updateCenter() {
    await fetch(`/api/leads/${lead.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ centerId: centerId || null }),
    });
    router.refresh();
  }

  async function addComment(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await fetch(`/api/leads/${lead.id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, channel }),
    });
    setBody("");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Link href="/leads" className="text-sm text-brand-600">← Back to leads</Link>
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">{lead.name}</h1>
          <p className="muted">{lead.company} · {lead.phone} · {lead.email}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/visitors?leadId=${lead.id}`} className="btn-ghost">Add Visitor / KYC</Link>
          <Link href={`/proposals?leadId=${lead.id}`} className="btn-primary">Create Proposal</Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="card space-y-3">
          <h2 className="h2">Lead Info</h2>
          <div><span className="muted">Source:</span> {lead.source}</div>
          <div><span className="muted">Seats needed:</span> {lead.seatsNeeded || "—"}</div>
          <div><span className="muted">Budget:</span> {lead.budget ? `₹${lead.budget}` : "—"}</div>
          <div><span className="muted">Notes:</span> {lead.notes || "—"}</div>

          <div className="pt-3 border-t">
            <label className="label">Status</label>
            {nextOptions.length > 0 ? (
              <div className="space-y-2">
                <select
                  className="input"
                  title="Status"
                  aria-label="Status"
                  value={nextStatus}
                  onChange={(e) => { setNextStatus(e.target.value); setStatusComment(""); }}
                >
                  {statusOptions.map((s) => (
                    <option key={s} value={s}>{s === lead.status ? `${s} (current)` : s}</option>
                  ))}
                </select>

                {statusChanged && (
                  <>
                    <label className="label">Comment <span className="text-rose-500">*</span></label>
                    <textarea
                      className="input"
                      rows={4}
                      placeholder={`Add a comment for moving "${lead.status}" → "${nextStatus}"…`}
                      value={statusComment}
                      onChange={(e) => setStatusComment(e.target.value)}
                    />
                    <button
                      type="button"
                      className="btn-primary disabled:opacity-50"
                      disabled={savingStatus || !statusComment.trim()}
                      onClick={upgradeStatus}
                    >
                      {savingStatus ? "Saving…" : `Move to ${nextStatus}`}
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div>
                <span className="badge bg-gray-100 text-gray-700">{lead.status}</span>
                <p className="muted text-xs mt-1">This is a final status — no further changes.</p>
              </div>
            )}
          </div>
          <div>
            <label className="label">Center</label>
            <select className="input" value={centerId} onChange={(e) => setCenterId(e.target.value)}>
              <option value="">— None —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={updateCenter}>Save Center</button>
        </div>

        <div className="card space-y-3">
          <h2 className="h2">Comments / Activity</h2>
          <form onSubmit={addComment} className="space-y-2">
            <div className="flex gap-2">
              <select className="input max-w-[140px]" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {CHANNELS.map((c) => <option key={c}>{c}</option>)}
              </select>
              <input className="input flex-1" placeholder="Add a note (e.g. WhatsApp message text)" value={body} onChange={(e) => setBody(e.target.value)} />
              <button className="btn-primary">Add</button>
            </div>
            <p className="muted text-xs">WhatsApp messages can be appended via API <code>POST /api/leads/{lead.id}/comments</code> from your WhatsApp webhook.</p>
          </form>

          <div className="space-y-2 pt-2">
            {lead.comments.map((c: any) => (
              <div key={c.id} className="border rounded-md p-2 text-sm">
                <div className="flex justify-between">
                  <span className="badge bg-gray-100 text-gray-700">{c.channel}</span>
                  <span className="muted text-xs">{fmtDateTime(c.createdAt)}</span>
                </div>

                {editingComment === c.id ? (
                  <div className="mt-1 space-y-1.5">
                    <textarea
                      className="input"
                      rows={3}
                      title="Edit comment"
                      aria-label="Edit comment"
                      value={commentDraft}
                      onChange={(e) => setCommentDraft(e.target.value)}
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="btn-primary py-1 px-2 text-xs disabled:opacity-50"
                        disabled={savingComment || !commentDraft.trim()}
                        onClick={() => saveEditComment(c.id)}
                      >
                        {savingComment ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost py-1 px-2 text-xs"
                        onClick={() => { setEditingComment(null); setCommentDraft(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1">{c.body}</div>
                )}

                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-400">
                    {c.author ? `by ${c.author.name}` : ""}
                    {c.editedAt && (
                      <span className="italic"> · edited {fmtDateTime(c.editedAt)}</span>
                    )}
                  </span>
                  {editingComment !== c.id && (
                    <span className="flex gap-2">
                      {c.edits?.length > 0 && (
                        <button
                          type="button"
                          className="text-xs text-gray-400 hover:text-brand-600"
                          onClick={() => setShowHistory((h) => ({ ...h, [c.id]: !h[c.id] }))}
                        >
                          {showHistory[c.id] ? "Hide history" : `History (${c.edits.length})`}
                        </button>
                      )}
                      <button
                        type="button"
                        className="text-xs text-gray-400 hover:text-brand-600"
                        onClick={() => startEditComment(c)}
                      >
                        Edit
                      </button>
                    </span>
                  )}
                </div>

                {showHistory[c.id] && c.edits?.length > 0 && (
                  <div className="mt-2 border-t pt-2 space-y-1.5">
                    {c.edits.map((e: any) => (
                      <div key={e.id} className="text-xs bg-gray-50 rounded p-1.5">
                        <div className="text-gray-400">
                          {e.editor ? `${e.editor.name} · ` : ""}{fmtDateTime(e.createdAt)}
                        </div>
                        <div className="text-gray-600 whitespace-pre-wrap">{e.prevBody}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {lead.comments.length === 0 && <p className="muted">No comments yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

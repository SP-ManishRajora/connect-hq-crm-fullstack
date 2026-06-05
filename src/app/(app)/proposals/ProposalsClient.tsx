"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { fmtINR } from "@/lib/utils";

async function uploadFile(file: File): Promise<string> {
  const fd = new FormData(); fd.append("file", file); fd.append("folder", "proposals");
  const r = await fetch("/api/upload", { method: "POST", body: fd });
  if (!r.ok) throw new Error("Upload failed");
  return (await r.json()).path;
}

const statusColor: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700",
  APPROVED: "bg-blue-100 text-blue-700",
  SENT: "bg-indigo-100 text-indigo-700",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
};

export default function ProposalsClient({ initial, leads, centers, preselectLeadId, threshold }: any) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(!!preselectLeadId);
  const [viewingProposal, setViewingProposal] = useState<any>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState<any>({
    leadId: preselectLeadId || "",
    centerId: "",
    cabinId: "",
    quotedPrice: "",
    negotiatedPrice: "",
    securityDeposit: 50000,
    lockInMonths: 12,
    customisations: "",
  });

  const cabins = useMemo(() => {
    const c = centers.find((x: any) => x.id === form.centerId);
    return c?.cabins || [];
  }, [form.centerId, centers]);

  const selectedCabin = cabins.find((c: any) => c.id === form.cabinId);

  // All images available from the selected center: common area + all cabin photos
  const centerImages = useMemo(() => {
    const c = centers.find((x: any) => x.id === form.centerId);
    if (!c) return [];
    function parseImgField(val: any): string[] {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { return JSON.parse(val); } catch { return []; }
    }
    const common = parseImgField(c.commonAreaPhotos);
    const cabin = (c.cabins || []).flatMap((cab: any) => parseImgField(cab.photos));
    return [...common, ...cabin];
  }, [form.centerId, centers]);

  const priceDiff =
    Number(form.quotedPrice) > 0 && Number(form.negotiatedPrice) > 0
      ? Number(form.negotiatedPrice) - Number(form.quotedPrice)
      : null;

  function toggleCenterImage(src: string) {
    setSelectedImages((prev) =>
      prev.includes(src) ? prev.filter((x) => x !== src) : [...prev, src]
    );
  }

  function handleCenterChange(centerId: string) {
    setForm({ ...form, centerId, cabinId: "" });
    setSelectedImages([]); // reset selection when center changes
  }

  async function handleImageUpload(files: FileList) {
    setUploading(true);
    try {
      const paths = await Promise.all(Array.from(files).map((f) => uploadFile(f)));
      setUploadedImages((prev) => [...prev, ...paths]);
    } catch { alert("Image upload failed"); }
    finally { setUploading(false); }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // store as {center:[...], uploaded:[...]} so the viewer can show them in separate groups
    const imageGroups = { center: selectedImages, uploaded: uploadedImages };
    const r = await fetch("/api/proposals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, images: imageGroups }),
    });
    if (r.ok) { setShowForm(false); setUploadedImages([]); setSelectedImages([]); router.refresh(); }
    else alert("Failed");
  }

  async function approve(id: string, decision: "APPROVE" | "REJECT") {
    await fetch(`/api/proposals/${id}/approve`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    router.refresh();
  }
  async function send(id: string) {
    const r = await fetch(`/api/proposals/${id}/send`, { method: "POST" });
    if (r.ok) { alert("Sent (logged to console). Cabin and common area photos attached."); router.refresh(); }
    else { const j = await r.json(); alert(j.error || "Failed"); }
  }
  async function accept(id: string) {
    if (!confirm("Mark proposal as accepted by client?")) return;
    await fetch(`/api/proposals/${id}/accept`, { method: "POST" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="h1">Proposals</h1>
          <p className="muted">Approval threshold: {fmtINR(threshold)} per seat. Cabin + common area photos auto-attach on send.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>+ New Proposal</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card grid sm:grid-cols-2 gap-3">

          {/* Lead */}
          <div>
            <label className="label">Lead</label>
            <select className="input" value={form.leadId} onChange={(e) => setForm({ ...form, leadId: e.target.value })}>
              <option value="">— None —</option>
              {leads.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({l.company})</option>)}
            </select>
          </div>

          {/* Center */}
          <div>
            <label className="label">Center *</label>
            <select className="input" required value={form.centerId} onChange={(e) => handleCenterChange(e.target.value)}>
              <option value="">— Select —</option>
              {centers.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Center images — shown once a center is selected */}
          {form.centerId && (
            <div className="sm:col-span-2">
              <label className="label">
                Center Images
                {selectedImages.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-brand-600">{selectedImages.length} selected</span>
                )}
              </label>
              {centerImages.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-3">No images uploaded for this center yet.</p>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {centerImages.map((src, i) => {
                    const isSelected = selectedImages.includes(src);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleCenterImage(src)}
                        className={`relative rounded-lg overflow-hidden border-2 transition focus:outline-none focus:ring-2 focus:ring-brand-500 ${
                          isSelected ? "border-brand-500 ring-2 ring-brand-400" : "border-transparent hover:border-gray-300"
                        }`}
                      >
                        <img src={src} alt="" className="w-full h-20 object-cover" />
                        {isSelected && (
                          <span className="absolute inset-0 bg-brand-500/20 flex items-center justify-center">
                            <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-sm flex items-center justify-center font-bold">✓</span>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedImages.length > 0 && (
                <button type="button" className="mt-1 text-xs text-gray-400 hover:text-red-500 transition"
                  onClick={() => setSelectedImages([])}>Clear selection</button>
              )}
            </div>
          )}

          {/* Cabin */}
          <div className="sm:col-span-2">
            <label className="label">Cabin (optional — leave blank for open seats)</label>
            <select className="input" value={form.cabinId} onChange={(e) => setForm({ ...form, cabinId: e.target.value })}>
              <option value="">Open / hot-desk seats</option>
              {cabins.map((c: any) => <option key={c.id} value={c.id}>{c.name} — {c.capacity} seater</option>)}
            </select>
            {selectedCabin && (() => {
              const cabinPhotos: string[] = Array.isArray(selectedCabin.photos)
                ? selectedCabin.photos
                : (() => { try { return JSON.parse(selectedCabin.photos || "[]"); } catch { return []; } })();
              return cabinPhotos.length > 0 ? (
                <div className="flex flex-wrap gap-2 mt-2">
                  {cabinPhotos.map((p: string, i: number) => (
                    <img key={i} src={p} className="w-16 h-16 object-cover rounded border" alt="" />
                  ))}
                </div>
              ) : null;
            })()}
          </div>

          {/* Pricing */}
          <div>
            <label className="label">Quoted Price (₹) *</label>
            <input className="input" type="number" required placeholder="0" value={form.quotedPrice}
              onChange={(e) => setForm({ ...form, quotedPrice: e.target.value })} />
          </div>
          <div>
            <label className="label">Negotiated Price (₹) *</label>
            <input className="input" type="number" required placeholder="0" value={form.negotiatedPrice}
              onChange={(e) => setForm({ ...form, negotiatedPrice: e.target.value })} />
            {priceDiff !== null && (
              <p className={`text-xs mt-1 ${priceDiff < 0 ? "text-rose-600" : priceDiff > 0 ? "text-emerald-600" : "text-gray-500"}`}>
                {priceDiff < 0 ? `▼ ${fmtINR(Math.abs(priceDiff))} below quoted` : priceDiff > 0 ? `▲ ${fmtINR(priceDiff)} above quoted` : "Same as quoted price"}
              </p>
            )}
          </div>

          <div>
            <label className="label">Security Deposit (₹) *</label>
            <input className="input" type="number" required value={form.securityDeposit}
              onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })} />
          </div>
          <div>
            <label className="label">Lock-in (months)</label>
            <input className="input" type="number" value={form.lockInMonths}
              onChange={(e) => setForm({ ...form, lockInMonths: Number(e.target.value) })} />
          </div>

          <div className="sm:col-span-2">
            <label className="label">Customisations</label>
            <textarea className="input" rows={3} value={form.customisations}
              onChange={(e) => setForm({ ...form, customisations: e.target.value })} />
          </div>

          {/* Additional uploaded images */}
          <div className="sm:col-span-2">
            <label className="label">Upload Additional Images</label>
            <label className={`flex items-center gap-2 w-fit cursor-pointer px-3 py-2 rounded border border-dashed border-gray-300 hover:border-brand-500 hover:bg-gray-50 text-sm text-gray-600 transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1M12 12V4m0 0L8 8m4-4l4 4" />
              </svg>
              {uploading ? "Uploading…" : "Choose images"}
              <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading}
                onChange={(e) => e.target.files && handleImageUpload(e.target.files)} />
            </label>
            {uploadedImages.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-3">
                {uploadedImages.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} alt="" className="w-20 h-20 object-cover rounded-lg border shadow-sm" />
                    <button type="button"
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      onClick={() => setUploadedImages(uploadedImages.filter((_, k) => k !== i))}>×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sm:col-span-2 flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={() => { setShowForm(false); setUploadedImages([]); setSelectedImages([]); }}>Cancel</button>
            <button className="btn-primary">Save Proposal</button>
          </div>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Lead</th><th>Center</th><th>Cabin</th><th>Quoted Price</th><th>Negotiated Price</th><th>SD</th><th>Lock-in</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {initial.map((p: any) => (
              <tr key={p.id}>
                <td>{p.lead?.name || "—"}<div className="text-xs text-gray-500">{p.createdBy?.name}</div></td>
                <td>{p.center?.name}</td>
                <td>{p.cabin?.name || "Open"}</td>
                <td>{fmtINR(p.quotedPrice)}</td>
                <td>{fmtINR(p.negotiatedPrice)}{p.belowThreshold && <span className="ml-1 text-xs text-amber-700">⚠</span>}</td>
                <td>{fmtINR(p.securityDeposit)}</td>
                <td>{p.lockInMonths}m</td>
                <td><span className={`badge ${statusColor[p.status]}`}>{p.status}</span></td>
                <td className="space-x-1">
                  <button type="button" className="btn-ghost text-xs" onClick={() => setViewingProposal(p)}>View</button>
                  {p.status === "PENDING_APPROVAL" && (
                    <>
                      <button className="btn-ghost text-xs" onClick={() => approve(p.id, "APPROVE")}>Approve</button>
                      <button className="btn-ghost text-xs" onClick={() => approve(p.id, "REJECT")}>Reject</button>
                    </>
                  )}
                  {(p.status === "DRAFT" || p.status === "APPROVED") && <button className="btn-ghost text-xs" onClick={() => send(p.id)}>Send</button>}
                  {p.status === "SENT" && <button className="btn-ghost text-xs" onClick={() => accept(p.id)}>Mark accepted</button>}
                </td>
              </tr>
            ))}
            {initial.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-8">No proposals</td></tr>}
          </tbody>
        </table>
      </div>

      {/* View Proposal Drawer */}
      {viewingProposal && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setViewingProposal(null)} />

          {/* Drawer */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-white shadow-xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-semibold text-lg">Proposal</h2>
                <p className="text-xs text-gray-500">{viewingProposal.lead?.name || "No lead"} · {viewingProposal.center?.name}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`badge ${statusColor[viewingProposal.status]}`}>{viewingProposal.status}</span>
                <a
                  href={`/api/proposals/${viewingProposal.id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition"
                  title="Download PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v2a2 2 0 002 2h14a2 2 0 002-2v-2" />
                  </svg>
                  PDF
                </a>
                <button type="button" className="text-gray-400 hover:text-gray-700 text-xl leading-none" onClick={() => setViewingProposal(null)}>×</button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Key details grid */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Lead</p>
                  <p className="font-medium">{viewingProposal.lead?.name || "—"}</p>
                  {viewingProposal.lead?.company && <p className="text-xs text-gray-500">{viewingProposal.lead.company}</p>}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Center</p>
                  <p className="font-medium">{viewingProposal.center?.name}</p>
                  <p className="text-xs text-gray-500">{viewingProposal.cabin?.name || "Open seats"}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Quoted Price</p>
                  <p className="font-medium">{fmtINR(viewingProposal.quotedPrice)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Negotiated Price</p>
                  <p className="font-medium">{fmtINR(viewingProposal.negotiatedPrice)}</p>
                  {viewingProposal.belowThreshold && <p className="text-xs text-amber-600">⚠ Below threshold</p>}
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Security Deposit</p>
                  <p className="font-medium">{fmtINR(viewingProposal.securityDeposit)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-0.5">Lock-in</p>
                  <p className="font-medium">{viewingProposal.lockInMonths} months</p>
                </div>
              </div>

              {/* Customisations */}
              {viewingProposal.customisations && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Customisations</p>
                  <p className="text-sm bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{viewingProposal.customisations}</p>
                </div>
              )}

              {/* Images */}
              {viewingProposal.imagesJson && (() => {
                let parsed: any = null;
                try { parsed = typeof viewingProposal.imagesJson === "string" ? JSON.parse(viewingProposal.imagesJson) : viewingProposal.imagesJson; } catch { return null; }

                // Support both new format {center:[...], uploaded:[...]} and legacy flat array
                const centerImgs: string[] = Array.isArray(parsed) ? [] : (parsed?.center || []);
                const uploadedImgs: string[] = Array.isArray(parsed) ? parsed : (parsed?.uploaded || []);
                const hasAny = centerImgs.length > 0 || uploadedImgs.length > 0;
                if (!hasAny) return null;

                const ImgGrid = ({ imgs }: { imgs: string[] }) => (
                  <div className="grid grid-cols-3 gap-2">
                    {imgs.map((src, i) => (
                      <a key={i} href={src} target="_blank" rel="noreferrer" title={`Image ${i + 1}`}
                        className="block rounded-lg overflow-hidden border hover:opacity-90 transition">
                        <img src={src} alt={`Image ${i + 1}`} className="w-full h-24 object-cover" />
                      </a>
                    ))}
                  </div>
                );

                return (
                  <div className="space-y-4">
                    {centerImgs.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Center Images ({centerImgs.length})</p>
                        <ImgGrid imgs={centerImgs} />
                      </div>
                    )}
                    {uploadedImgs.length > 0 && (
                      <div>
                        <p className="text-xs text-gray-500 mb-2">Uploaded Images ({uploadedImgs.length})</p>
                        <ImgGrid imgs={uploadedImgs} />
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Meta */}
              <div className="text-xs text-gray-400 space-y-0.5 pt-2 border-t">
                <p>Created by {viewingProposal.createdBy?.name || "—"}</p>
                {viewingProposal.approvedBy && <p>Approved by {viewingProposal.approvedBy.name}</p>}
                {viewingProposal.sentAt && <p>Sent {new Date(viewingProposal.sentAt).toLocaleDateString()}</p>}
                {viewingProposal.acceptedAt && <p>Accepted {new Date(viewingProposal.acceptedAt).toLocaleDateString()}</p>}
              </div>
            </div>

            {/* Footer actions */}
            <div className="border-t px-6 py-4 flex gap-2 justify-end">
              {viewingProposal.status === "PENDING_APPROVAL" && (
                <>
                  <button type="button" className="btn-ghost text-xs" onClick={() => { approve(viewingProposal.id, "REJECT"); setViewingProposal(null); }}>Reject</button>
                  <button type="button" className="btn-primary text-xs" onClick={() => { approve(viewingProposal.id, "APPROVE"); setViewingProposal(null); }}>Approve</button>
                </>
              )}
              {(viewingProposal.status === "DRAFT" || viewingProposal.status === "APPROVED") && (
                <button type="button" className="btn-primary text-xs" onClick={() => { send(viewingProposal.id); setViewingProposal(null); }}>Send</button>
              )}
              {viewingProposal.status === "SENT" && (
                <button type="button" className="btn-primary text-xs" onClick={() => { accept(viewingProposal.id); setViewingProposal(null); }}>Mark Accepted</button>
              )}
              <button type="button" className="btn-ghost text-xs" onClick={() => setViewingProposal(null)}>Close</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

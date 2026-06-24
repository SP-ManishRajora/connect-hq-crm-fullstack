import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { logAction } from "@/lib/audit";
import { readFile, writeFile, mkdir, access } from "fs/promises";
import path from "path";

// Keep only images that can actually be displayed: remote (http) URLs pass through,
// local /uploads/... paths are kept only if the file exists on disk. This prevents a
// dangling reference from rendering a broken/404 image in the proposal document.
async function filterExistingImages(imgs: string[]): Promise<string[]> {
  const checks = await Promise.all(
    imgs.map(async (src) => {
      if (!src) return false;
      if (src.startsWith("http")) return true;
      const rel = src.replace(/^\//, ""); // "/uploads/x.png" -> "uploads/x.png"
      try {
        await access(path.join(process.cwd(), "public", rel));
        return true;
      } catch {
        return false;
      }
    }),
  );
  return imgs.filter((_, i) => checks[i]);
}

// Parse a currency/number string like "₹6,60,000 + GST" → 660000. Returns null if no digits.
function parseAmount(s: string | undefined | null): number | null {
  if (s == null) return null;
  const digits = String(s).replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// Parse a leading integer like "4 Months Lock-in" → 4.
function parseMonths(s: string | undefined | null): number | null {
  if (s == null) return null;
  const m = String(s).match(/\d+/);
  return m ? Number(m[0]) : null;
}

function fmtINR(n: number) {
  return "₹" + Number(n).toLocaleString("en-IN");
}

function parseImages(imagesJson: string | null): { center: string[]; uploaded: string[] } {
  if (!imagesJson) return { center: [], uploaded: [] };
  try {
    const parsed = JSON.parse(imagesJson);
    if (Array.isArray(parsed)) return { center: [], uploaded: parsed };
    return { center: parsed.center || [], uploaded: parsed.uploaded || [] };
  } catch { return { center: [], uploaded: [] }; }
}

function buildPhotoGallery(imgs: string[], baseUrl: string): string {
  if (!imgs.length) return "";
  const toAbs = (src: string) => src.startsWith("http") ? src : `${baseUrl}${src}`;
  const wrap = (src: string, cap: string) =>
    `<div class="photo-wrap"><img src="${toAbs(src)}" alt="${cap}" /><div class="photo-cap">${cap}</div></div>`;

  const captions = ["Workspace", "Collaborative Area", "Open Space", "Private Cabin", "Reception & Lobby"];
  const rows: string[] = [];

  // Row 1: first 2 images (1.8fr + 1fr layout)
  if (imgs.length >= 1) {
    const row1Imgs = imgs.slice(0, 2);
    rows.push(`<div class="photo-row1">${row1Imgs.map((s, i) => wrap(s, captions[i] || `Photo ${i + 1}`)).join("")}</div>`);
  }
  // Row 2: next 3 images
  if (imgs.length >= 3) {
    const row2Imgs = imgs.slice(2, 5);
    rows.push(`<div class="photo-row2">${row2Imgs.map((s, i) => wrap(s, captions[i + 2] || `Photo ${i + 3}`)).join("")}</div>`);
  }

  return rows.length ? `<div class="photo-gallery">${rows.join("")}</div>` : "";
}

// Replaces the template's plain "Save as PDF" button with a Save+Print toolbar and the
// client script that posts edited DB fields + the full rendered HTML back to the server.
function injectEditToolbar(html: string, proposalId: string): string {
  const toolbar = `
<div class="edit-toolbar no-print" style="position:fixed;top:0;left:0;right:0;z-index:9999;display:flex;gap:10px;justify-content:center;align-items:center;background:#1e1b4b;color:#fff;padding:10px 16px;font-family:system-ui,sans-serif;font-size:.85rem;box-shadow:0 2px 8px rgba(0,0,0,.2);">
  <span style="margin-right:auto;font-weight:600;">✏️ Editing proposal — yellow fields are editable</span>
  <span id="save-status" style="opacity:.85;"></span>
  <button type="button" id="btn-save" style="background:#6366f1;color:#fff;border:0;border-radius:6px;padding:7px 16px;font-weight:600;cursor:pointer;">Save</button>
  <button type="button" id="btn-save-print" style="background:#10b981;color:#fff;border:0;border-radius:6px;padding:7px 16px;font-weight:600;cursor:pointer;">Save &amp; Print</button>
</div>
<div class="no-print" style="height:48px;"></div>
<script>
(function(){
  var STATUS = document.getElementById('save-status');
  function setStatus(t){ STATUS.textContent = t; }
  function collect(){
    var fields = {};
    document.querySelectorAll('[data-field]').forEach(function(el){
      fields[el.getAttribute('data-field')] = el.innerText.trim();
    });
    // Snapshot HTML without the editing chrome (toolbar/banner/contenteditable).
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('.edit-toolbar,.edit-banner,.print-btn,script').forEach(function(n){ n.remove(); });
    clone.querySelectorAll('[contenteditable]').forEach(function(n){ n.removeAttribute('contenteditable'); });
    return { fields: fields, html: '<!DOCTYPE html>' + clone.outerHTML };
  }
  function save(){
    setStatus('Saving…');
    return fetch('/api/proposals/${proposalId}/pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(collect())
    }).then(function(r){
      if(!r.ok) return r.json().catch(function(){return {};}).then(function(d){ throw new Error(d.error || ('HTTP '+r.status)); });
      setStatus('Saved ✓');
      return r.json();
    }).catch(function(e){ setStatus('Failed: ' + e.message); throw e; });
  }
  document.getElementById('btn-save').addEventListener('click', save);
  document.getElementById('btn-save-print').addEventListener('click', function(){
    save().then(function(){ setTimeout(function(){ window.print(); }, 150); });
  });
})();
</script>`;
  // Drop the template's own print button; the toolbar replaces it.
  html = html.replace(/<button class="print-btn no-print"[\s\S]*?<\/button>/, "");
  return html.replace(/<body>/, "<body>" + toolbar);
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // ?edit=1 → keep the template's editable fields + show an in-page Save toolbar.
  const editMode = req.nextUrl.searchParams.get("edit") === "1";

  const p = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { lead: true, center: true, cabin: true, createdBy: true },
  }) as any;
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  const templatePath = path.join(process.cwd(), "ConnectHQ_Proposal_Template.html");
  let html: string;
  try {
    html = await readFile(templatePath, "utf-8");
  } catch {
    return NextResponse.json(
      { error: `Proposal template not found at ${templatePath}. Ensure ConnectHQ_Proposal_Template.html is deployed to the project root.` },
      { status: 500 },
    );
  }

  // -- Logo: use the static /public/logo.png instead of the template's inline base64 copy. --
  html = html.replace(
    /<div class="lh-logo">[\s\S]*?<\/div>/,
    `<div class="lh-logo"><img src="${baseUrl}/logo.png" alt="ConnectHQ" /></div>`
  );

  // -- Date --
  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
  html = html.replace(
    /<div class="date-row">.*?<\/div>/s,
    `<div class="date-row"><em>Date: ${today}</em></div>`
  );

  // -- Dear line --
  const clientName = p.lead?.name || "Sir/Ma'am";
  html = html.replace(
    /<div class="dear-line">.*?<\/div>/s,
    `<div class="dear-line">Dear ${clientName},</div>`
  );

  // -- Location line --
  const location = `ConnectHQ Coworking Pvt. Ltd, ${p.center?.name || ""}${p.cabin ? ` — ${p.cabin.name}` : ""}`;
  html = html.replace(
    /<div class="loc-line">.*?<\/div>/s,
    `<div class="loc-line">${location}</div>`
  );

  // -- Photo gallery (skip any image whose file is missing on disk) --
  const { center: centerImgs, uploaded: uploadedImgs } = parseImages(p.imagesJson);
  const allImgs = await filterExistingImages([...centerImgs, ...uploadedImgs]);
  // Only swap in the proposal's own images when it actually has some; otherwise keep the
  // template's default aesthetic workspace photos so the section below "Membership Details:"
  // is never empty.
  if (allImgs.length) {
    const gallery = buildPhotoGallery(allImgs, baseUrl);
    // Replace the entire photo-gallery div (including all nested closing tags) precisely
    html = html.replace(/<div class="photo-gallery">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/, gallery);
  }

  // -- Pricing table --
  const gst = Math.round(p.negotiatedPrice * 0.18);
  const monthlyTotal = p.negotiatedPrice + gst;
  const secDeposit = p.securityDeposit;
  const totalOnboarding = monthlyTotal + secDeposit;

  const pricingTable = `
<table class="pricing-table">
  <thead><tr><th>Description</th><th>Amount</th><th>Note</th></tr></thead>
  <tbody>
    <tr>
      <td>Quoted Price</td>
      <td class="strike">${fmtINR(p.quotedPrice)} + GST</td>
      <td>—</td>
    </tr>
    <tr>
      <td>Negotiated Price</td>
      <td class="price-col" data-field="negotiatedPrice">${fmtINR(p.negotiatedPrice)} + GST</td>
      <td>${p.cabin?.name || "Open seats"} · ${p.center?.name}</td>
    </tr>
    <tr>
      <td colspan="2">GST @ 18%</td>
      <td>${fmtINR(gst)}</td>
    </tr>
    <tr class="row-total">
      <td colspan="2"><strong>Monthly Total Payable (incl. GST)</strong></td>
      <td>${fmtINR(monthlyTotal)}</td>
    </tr>
  </tbody>
</table>`;
  html = html.replace(/<table class="pricing-table">[\s\S]*?<\/table>/, pricingTable);

  // -- Section 2 label --
  html = html.replace(
    /<div class="sec-label"><span class="sec-num">2<\/span>[\s\S]*?<\/div>/,
    `<div class="sec-label"><span class="sec-num">2</span> Total Billing</div>`
  );

  // -- Total cards --
  const totalSection = `
<div class="total-section">
  <div class="total-card">
    <div class="tl">Security Deposit</div>
    <div class="tv" data-field="securityDeposit">${fmtINR(secDeposit)}</div>
    <div class="tn">As agreed</div>
  </div>
  <div class="total-card dark">
    <div class="tl">Total Payable at Onboarding</div>
    <div class="tv">${fmtINR(totalOnboarding)}</div>
    <div class="tn">1st Month (incl. GST) + Security Deposit</div>
  </div>
</div>`;
  html = html.replace(/<div class="total-section">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/, totalSection);

  // -- Terms table: notice period & lock-in --
  html = html.replace(
    /<tr><td>Notice Period<\/td><td contenteditable="true">.*?<\/td><\/tr>/,
    `<tr><td>Notice Period</td><td data-field="lockInMonths">${p.lockInMonths} Months Lock-in</td></tr>`
  );

  // -- Customisations info box --
  if (p.customisations) {
    html = html.replace(
      /<div class="info-box">[\s\S]*?<\/div>/,
      `<div class="info-box"><strong>Customisations</strong><span data-field="customisations">${p.customisations}</span></div>`
    );
  } else {
    // Still tag an empty span so edit mode can add customisations.
    html = html.replace(
      /<div class="info-box">[\s\S]*?<\/div>/,
      `<div class="info-box"><strong>Customisations</strong><span data-field="customisations"></span></div>`
    );
  }

  if (editMode) {
    // -- Edit mode: keep fields editable, mark DB-backed ones, swap toolbar to "Save & Print". --
    // Make the DB-backed cells contenteditable too (some were static after the DB merge above).
    html = html.replace(/data-field="(\w+)"/g, 'data-field="$1" contenteditable="true"');
    html = injectEditToolbar(html, params.id);
  } else {
    // -- Remove editable attributes & edit banner for the clean read-only PDF view. --
    html = html.replace(/contenteditable="true"/g, "");
    html = html.replace(/<div class="edit-banner no-print">[\s\S]*?<\/div>/, "");
  }

  // -- Convert all relative /uploads/ image paths to absolute --
  html = html.replace(/src="(\/uploads\/[^"]+)"/g, `src="${baseUrl}$1"`);

  // -- Inject PDF-specific overrides before </head> --
  // @page margin:0 removes browser-added date/title/URL/page-number headers & footers.
  // Body padding compensates so content isn't flush against the paper edge.
  const pdfStyles = `
<style>
  @page { margin: 0; size: A4; }
  body { margin: 0 !important; padding: 12mm 0 !important; background: white !important; }
  .page { margin: 0 auto !important; border-radius: 0 !important; box-shadow: none !important; }
  .lh-logo img { height: 80px !important; width: auto !important; object-fit: contain !important; }
  /* Prevent mid-block page breaks */
  .photo-gallery, .photo-row1, .photo-row2,
  .pricing-table, .total-section, .total-card,
  .amenities, .sig-section, .terms-table,
  .info-box, .sec-label { page-break-inside: avoid; break-inside: avoid; }
  /* Keep section labels with following content */
  .sec-label { page-break-after: avoid; break-after: avoid; }
  /* Gallery rows should not split */
  .photo-row1, .photo-row2 { page-break-inside: avoid; break-inside: avoid; }
</style>`;
  html = html.replace("</head>", pdfStyles + "\n</head>");

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  } catch (err: any) {
    console.error("GET /api/proposals/[id]/pdf failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to generate proposal document" },
      { status: 500 },
    );
  }
}

// Save edits made in the editable proposal document.
//  - Structured fields (data-field) that map to DB columns are parsed and persisted.
//  - The full rendered HTML is written to /public/uploads/proposals as a snapshot copy,
//    so the exact document (including free-text/formatting edits) is preserved.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const u = await getSessionUser();
    if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const existing = await prisma.proposal.findUnique({
      where: { id: params.id },
      select: { id: true, negotiatedPrice: true, securityDeposit: true, lockInMonths: true, customisations: true },
    });
    if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

    const body = await req.json();
    const fields = (body?.fields || {}) as Record<string, string>;
    const snapshotHtml = typeof body?.html === "string" ? body.html : "";

    // Map edited fields → DB columns, persisting only real changes.
    const data: Record<string, any> = {};
    const changed: string[] = [];

    const neg = parseAmount(fields.negotiatedPrice);
    if (neg != null && neg !== existing.negotiatedPrice) { data.negotiatedPrice = neg; changed.push("negotiatedPrice"); }

    const sec = parseAmount(fields.securityDeposit);
    if (sec != null && sec !== existing.securityDeposit) { data.securityDeposit = sec; changed.push("securityDeposit"); }

    const lock = parseMonths(fields.lockInMonths);
    if (lock != null && lock !== existing.lockInMonths) { data.lockInMonths = lock; changed.push("lockInMonths"); }

    if (typeof fields.customisations === "string") {
      const cust = fields.customisations.trim() || null;
      if (cust !== (existing.customisations || null)) { data.customisations = cust; changed.push("customisations"); }
    }

    // Write the snapshot copy of the document to disk.
    let snapshotPath: string | null = null;
    if (snapshotHtml) {
      const dir = path.join(process.cwd(), "public", "uploads", "proposals");
      await mkdir(dir, { recursive: true });
      const fileName = `proposal-${params.id}.html`;
      await writeFile(path.join(dir, fileName), snapshotHtml, "utf-8");
      snapshotPath = `/uploads/proposals/${fileName}`;
      data.pdfSnapshot = snapshotPath;
    }

    const updated = await prisma.proposal.update({ where: { id: params.id }, data });

    await logAction({
      userId: u.id,
      action: "PROPOSAL_PDF_EDITED",
      targetType: "Proposal",
      targetId: params.id,
      meta: { changedFields: changed, snapshot: snapshotPath },
    });

    return NextResponse.json({ ok: true, changed, snapshot: snapshotPath, proposal: updated });
  } catch (err: any) {
    console.error("POST /api/proposals/[id]/pdf failed:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to save proposal document" },
      { status: 500 },
    );
  }
}

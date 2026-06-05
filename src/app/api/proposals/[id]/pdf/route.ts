import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

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

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const p = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { lead: true, center: true, cabin: true, createdBy: true },
  }) as any;
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const baseUrl = process.env.APP_URL || "http://localhost:3000";
  const templatePath = path.join(process.cwd(), "ConnectHQ_Proposal_Template.html");
  let html = await readFile(templatePath, "utf-8");

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

  // -- Photo gallery --
  const { center: centerImgs, uploaded: uploadedImgs } = parseImages(p.imagesJson);
  const allImgs = [...centerImgs, ...uploadedImgs];
  const gallery = buildPhotoGallery(allImgs, baseUrl);
  // Replace the entire photo-gallery div (including all nested closing tags) precisely
  html = html.replace(/<div class="photo-gallery">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/, gallery);

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
      <td class="price-col">${fmtINR(p.negotiatedPrice)} + GST</td>
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
    <div class="tv">${fmtINR(secDeposit)}</div>
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
    `<tr><td>Notice Period</td><td>${p.lockInMonths} Months Lock-in</td></tr>`
  );

  // -- Customisations info box --
  if (p.customisations) {
    html = html.replace(
      /<div class="info-box">[\s\S]*?<\/div>/,
      `<div class="info-box"><strong>Customisations</strong>${p.customisations}</div>`
    );
  }

  // -- Remove editable attributes & edit banner for PDF --
  html = html.replace(/contenteditable="true"/g, "");
  html = html.replace(/<div class="edit-banner no-print">[\s\S]*?<\/div>/, "");

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
}

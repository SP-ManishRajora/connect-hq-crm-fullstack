import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ocrInvoice } from "@/lib/ocr";

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const b = await req.json();

  const parsed = await ocrInvoice(b.filePath);

  // PO match logic
  let poMatchStatus = "UNMATCHED";
  if (b.poId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: b.poId } });
    if (po) {
      const tolerance = 0.05;
      const diff = Math.abs((parsed.amount || 0) - po.totalAmount) / Math.max(1, po.totalAmount);
      poMatchStatus = diff <= tolerance ? "MATCHED" : "MISMATCH";
    }
  } else if (parsed.poNumber) {
    // try fuzzy match by poNumber from OCR
    const po = await prisma.purchaseOrder.findFirst({ where: { poNumber: parsed.poNumber } });
    if (po) {
      b.poId = po.id;
      const diff = Math.abs((parsed.amount || 0) - po.totalAmount) / Math.max(1, po.totalAmount);
      poMatchStatus = diff <= 0.05 ? "MATCHED" : "MISMATCH";
    }
  }

  const v = await prisma.vendorInvoice.create({
    data: {
      vendorId: b.vendorId,
      poId: b.poId || null,
      filePath: b.filePath,
      ocrJson: JSON.stringify(parsed),
      invoiceNo: parsed.invoiceNo || null,
      invoiceDate: parsed.invoiceDate ? new Date(parsed.invoiceDate) : null,
      amount: parsed.amount || 0,
      gst: parsed.gst || 0,
      poMatchStatus,
    },
    include: { vendor: true, po: true },
  });
  return NextResponse.json(v);
}

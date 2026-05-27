import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me || !requireRole(me.role, ["ADMIN", "OWNER", "ACCOUNTS", "MANAGER"])) {
    return NextResponse.json({ error: "Approval rights only" }, { status: 403 });
  }
  const { decision, remarks } = await req.json();
  const inv = await prisma.vendorInvoice.update({
    where: { id: params.id },
    data: { status: decision, approvedById: me.id, remarks: remarks || null },
    include: { vendor: true, po: true },
  });
  if (decision === "APPROVED") {
    // Book expense + ledger
    await prisma.expense.create({
      data: {
        category: "OTHER",
        amount: inv.amount,
        gst: inv.gst,
        tds: 0,
        payee: inv.vendor.name,
        paymentMode: "BANK",
        notes: `Vendor invoice ${inv.invoiceNo || ""} (PO ${inv.po?.poNumber || "—"})`,
        attachment: inv.filePath,
      },
    });
    await prisma.ledgerEntry.create({
      data: { account: "Vendor Payable", debit: inv.amount + inv.gst, credit: 0, refType: "EXPENSE", refId: inv.id, narration: `Approved: ${inv.vendor.name}` },
    });
    await prisma.vendorInvoice.update({ where: { id: inv.id }, data: { status: "BOOKED" } });
  }
  return NextResponse.json(inv);
}

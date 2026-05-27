import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

export async function GET() {
  const u = await getSessionUser();
  if (!u || u.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  const centers = await prisma.center.findMany();
  const rows: string[] = ["Center,Inflow_Paid,GST_Collected,Outflow,TDS_Deducted,GST_on_Expense,Net"];
  for (const c of centers) {
    const inv = await prisma.clientInvoice.findMany({ where: { centerId: c.id } });
    const exp = await prisma.expense.findMany({ where: { centerId: c.id } });
    const inflow = inv.filter((i) => i.status === "PAID").reduce((a, x) => a + x.totalAmount, 0);
    const gst = inv.reduce((a, x) => a + x.gstAmount, 0);
    const outflow = exp.reduce((a, x) => a + x.amount, 0);
    const tds = exp.reduce((a, x) => a + x.tds, 0);
    const expGst = exp.reduce((a, x) => a + x.gst, 0);
    rows.push([c.name, inflow, gst, outflow, tds, expGst, inflow - outflow].join(","));
  }
  return new NextResponse(rows.join("\n"), {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="cashflow-${Date.now()}.csv"` },
  });
}

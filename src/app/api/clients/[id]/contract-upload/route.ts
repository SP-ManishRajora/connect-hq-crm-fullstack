import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { ocrContract } from "@/lib/ocr";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { path } = await req.json();
  if (!path) return NextResponse.json({ error: "no file path" }, { status: 400 });

  const parsed = await ocrContract(path);

  // Update or create contract
  const existing = await prisma.contract.findUnique({ where: { clientId: params.id } });
  if (existing) {
    await prisma.contract.update({
      where: { id: existing.id },
      data: { filePath: path, ocrParsedJson: JSON.stringify(parsed) },
    });
  } else {
    const client = await prisma.client.findUniqueOrThrow({ where: { id: params.id } });
    const startDate = parsed.startDate ? new Date(parsed.startDate) : (client.startDate || new Date());
    const revisionDate = parsed.renewDate ? new Date(parsed.renewDate) : new Date(startDate.getTime() + 365 * 24 * 3600 * 1000);
    await prisma.contract.create({
      data: {
        clientId: params.id,
        startDate,
        revisionDate,
        monthlyRent: parsed.monthlyRent || 0,
        securityDeposit: 0,
        incrementPct: parsed.incrementPct || 5,
        filePath: path,
        ocrParsedJson: JSON.stringify(parsed),
      },
    });
  }
  return NextResponse.json({ ok: true, parsed });
}

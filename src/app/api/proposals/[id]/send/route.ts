import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendMail, fmtINR } from "@/lib/utils";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await prisma.proposal.findUnique({
    where: { id: params.id },
    include: { lead: true, center: true, cabin: true },
  });
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.status === "PENDING_APPROVAL") return NextResponse.json({ error: "Manager approval required before sending" }, { status: 400 });
  if (!p.lead?.email) return NextResponse.json({ error: "Lead has no email" }, { status: 400 });

  // Combine cabin photos + center common area photos
  const cabinPics = p.cabin?.photos ? (JSON.parse(p.cabin.photos) as string[]) : [];
  const commonPics = p.center.commonAreaPhotos ? (JSON.parse(p.center.commonAreaPhotos) as string[]) : [];
  const allPics = [...cabinPics, ...commonPics];

  await sendMail(
    p.lead.email,
    `Proposal for ${p.center.name}`,
    `Hi ${p.lead.name},\n\nThank you for your interest. Find our proposal below:\n\n` +
      `Center: ${p.center.name}\n` +
      `Cabin: ${p.cabin?.name || "Open seats"}\n` +
      `Quoted Price: ${fmtINR(p.quotedPrice)}\n` +
      `Negotiated Price: ${fmtINR(p.negotiatedPrice)}\n` +
      `Security Deposit: ${fmtINR(p.securityDeposit)}\n` +
      `Lock-in: ${p.lockInMonths} months\n\n` +
      (p.customisations ? `Customisations: ${p.customisations}\n\n` : "") +
      (allPics.length ? `Photos:\n${allPics.map((u) => `  • ${process.env.APP_URL || ""}${u}`).join("\n")}\n\n` : "") +
      `Looking forward to hosting you!\n\nWarm regards,\nCoworking ERP`
  );

  const updated = await prisma.proposal.update({
    where: { id: params.id },
    data: { status: "SENT", sentAt: new Date(), imagesJson: allPics.length ? JSON.stringify(allPics) : null },
  });
  if (p.leadId) await prisma.lead.update({ where: { id: p.leadId }, data: { status: "PROPOSAL_SENT" } });
  return NextResponse.json(updated);
}

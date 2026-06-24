import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { fmtINR } from "@/lib/utils";
import { sendMail } from "@/lib/mail";
import { isValidEmail } from "@/lib/validators";

type ProposalWithRels = NonNullable<Awaited<ReturnType<typeof loadProposal>>>;

function loadProposal(id: string) {
  return prisma.proposal.findUnique({
    where: { id },
    include: { lead: true, center: true, cabin: true },
  });
}

function proposalLink(id: string) {
  return `${process.env.APP_URL || ""}/api/proposals/${id}/pdf`;
}

// The default subject + body that pre-populate the email composer. The proposal link
// is kept separate so the composer's "include link" toggle can append it at send time.
function buildDefaultEmail(p: ProposalWithRels) {
  const subject = `Proposal for ${p.center.name}`;
  const body =
    `Hi ${p.lead?.name || "there"},\n\nThank you for your interest. Find our proposal below:\n\n` +
    `Center: ${p.center.name}\n` +
    `Cabin: ${p.cabin?.name || "Open seats"}\n` +
    `Quoted Price: ${fmtINR(p.quotedPrice)}\n` +
    `Negotiated Price: ${fmtINR(p.negotiatedPrice)}\n` +
    `Security Deposit: ${fmtINR(p.securityDeposit)}\n` +
    `Lock-in: ${p.lockInMonths} months\n\n` +
    (p.customisations ? `Customisations: ${p.customisations}\n\n` : "") +
    `Looking forward to hosting you!\n\nWarm regards,\nConnectHQ`;
  return { subject, body };
}

// GET — returns the default composer content (subject/body), recipient, and proposal link
// so the UI can preview/populate the email editor before sending.
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await loadProposal(params.id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { subject, body } = buildDefaultEmail(p);
  return NextResponse.json({
    recipient: p.lead?.email || "",
    subject,
    body,
    link: proposalLink(p.id),
    alreadySent: p.status === "SENT",
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const p = await loadProposal(params.id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.status === "PENDING_APPROVAL") return NextResponse.json({ error: "Manager approval required before sending" }, { status: 400 });

  const reqBody = await req.json().catch(() => ({}));

  // Recipient: the email confirmed in the composer, else fall back to the lead's email.
  const recipient = String(reqBody?.email || p.lead?.email || "").trim();
  if (!recipient) return NextResponse.json({ error: "No recipient email. Add one before sending." }, { status: 400 });
  if (!isValidEmail(recipient)) return NextResponse.json({ error: "Recipient email is not valid." }, { status: 400 });

  // Subject/body come from the composer; fall back to defaults if absent.
  const defaults = buildDefaultEmail(p);
  const subject = String(reqBody?.subject ?? "").trim() || defaults.subject;
  let body = String(reqBody?.body ?? "").trim() || defaults.body;

  // Optionally append the proposal link (composer checkbox, default on).
  const includeLink = reqBody?.includeLink !== false;
  if (includeLink) body += `\n\nView the full proposal: ${proposalLink(p.id)}`;

  // Combine cabin photos + center common area photos (recorded on the proposal for the PDF view).
  const cabinPics = p.cabin?.photos ? (JSON.parse(p.cabin.photos) as string[]) : [];
  const commonPics = p.center.commonAreaPhotos ? (JSON.parse(p.center.commonAreaPhotos) as string[]) : [];
  const allPics = [...cabinPics, ...commonPics];

  const result = await sendMail(recipient, subject, body);

  const updated = await prisma.proposal.update({
    where: { id: params.id },
    data: { status: "SENT", sentAt: new Date(), imagesJson: allPics.length ? JSON.stringify(allPics) : null },
  });
  // Persist the (possibly edited) recipient back to the lead, and advance its status.
  if (p.leadId) {
    await prisma.lead.update({
      where: { id: p.leadId },
      data: { status: "PROPOSAL_SENT", ...(recipient !== p.lead?.email ? { email: recipient } : {}) },
    });
  }
  return NextResponse.json({ ...updated, recipient, emailSent: result.sent });
}

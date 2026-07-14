// Client self-registration & password-reset helpers.
// Server-only: uses node:crypto and the ClientInvite table. Both the INVITE and
// RESET flows share one token store (distinguished by ClientInvite.type).
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { sendMail } from "@/lib/mail";

const INVITE_TTL_HOURS = 72; // registration links valid 3 days
const RESET_TTL_HOURS = 2; // password-reset links valid 2 hours

function newToken() {
  return randomBytes(32).toString("hex");
}

function appBaseUrl() {
  // APP_URL lets emails link to the deployed host; falls back to localhost for dev.
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

// How many CLIENT logins a client is allowed = its occupied seats (min 1 so a
// 1-seat client can still have one login). Pending (unused, unexpired) invites
// count toward the cap so we don't over-issue.
export async function loginCapFor(clientId: string) {
  const client = await prisma.client.findUnique({ where: { id: clientId } });
  if (!client) return { cap: 0, used: 0, remaining: 0, client: null };
  const cap = Math.max(1, client.occupiedSeats || 0);
  const [activeUsers, pendingInvites] = await Promise.all([
    prisma.user.count({ where: { employerClientId: clientId, role: "CLIENT", deletedAt: null } }),
    prisma.clientInvite.count({
      where: { employerClientId: clientId, type: "INVITE", usedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  const used = activeUsers + pendingInvites;
  return { cap, used, remaining: Math.max(0, cap - used), client };
}

// Create an INVITE token for a prospective client user and email the link.
export async function createInvite(opts: {
  email: string;
  employerClientId: string;
  invitedById?: string | null;
  companyName?: string | null;
}) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  await prisma.clientInvite.create({
    data: {
      token,
      type: "INVITE",
      email: opts.email.trim().toLowerCase(),
      employerClientId: opts.employerClientId,
      invitedById: opts.invitedById || null,
      expiresAt,
    },
  });
  const link = await sendInviteMail(opts.email, token, opts.companyName);
  return { token, link, expiresAt };
}

// Reissue an existing INVITE row with a fresh token + expiry, then re-email it.
// Reusing the row (instead of creating a new one) keeps the login cap accurate —
// a resend does NOT count as an extra pending invite. Returns null if the invite
// is missing, is not an INVITE, or has already been used.
export async function reissueInvite(inviteId: string, companyName?: string | null) {
  const inv = await prisma.clientInvite.findUnique({ where: { id: inviteId } });
  if (!inv || inv.type !== "INVITE" || inv.usedAt) return null;
  const token = newToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000);
  await prisma.clientInvite.update({ where: { id: inviteId }, data: { token, expiresAt } });
  const link = await sendInviteMail(inv.email, token, companyName);
  return { token, link, expiresAt, email: inv.email };
}

// Revoke a pending INVITE so it stops counting against the login cap and its link
// (if any) can no longer be used. Idempotent-ish: returns null if not a pending invite.
export async function revokeInvite(inviteId: string) {
  const inv = await prisma.clientInvite.findUnique({ where: { id: inviteId } });
  if (!inv || inv.type !== "INVITE" || inv.usedAt) return null;
  await prisma.clientInvite.update({ where: { id: inviteId }, data: { usedAt: new Date() } });
  return inv;
}

async function sendInviteMail(email: string, token: string, companyName?: string | null) {
  const link = `${appBaseUrl()}/register?token=${token}`;
  await sendMail(
    email,
    "You're invited to the client portal",
    `Hello,\n\nYou've been invited to access the ${companyName || "client"} workspace portal.\n\nSet up your account here (link valid ${INVITE_TTL_HOURS} hours):\n${link}\n\nIf you did not expect this, you can ignore this email.`,
    {
      html: `<p>Hello,</p><p>You've been invited to access the <strong>${companyName || "client"}</strong> workspace portal.</p><p><a href="${link}">Set up your account</a> (link valid ${INVITE_TTL_HOURS} hours).</p><p>If you did not expect this, you can ignore this email.</p>`,
    },
  );
  return link;
}

// Look up a still-valid INVITE by token.
export async function findValidInvite(token: string) {
  if (!token) return null;
  const inv = await prisma.clientInvite.findUnique({ where: { token } });
  if (!inv || inv.type !== "INVITE") return null;
  if (inv.usedAt) return null;
  if (inv.expiresAt < new Date()) return null;
  return inv;
}

// Create a RESET token for an existing user and email the link.
// Always resolves without revealing whether the email exists (anti-enumeration).
export async function createResetForEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || !user.active) return { sent: false };
  const token = newToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 3600 * 1000);
  await prisma.clientInvite.create({
    data: { token, type: "RESET", email: user.email, userId: user.id, expiresAt },
  });
  const link = `${appBaseUrl()}/reset-password?token=${token}`;
  await sendMail(
    user.email,
    "Reset your password",
    `Hello ${user.name},\n\nWe received a request to reset your password.\n\nReset it here (link valid ${RESET_TTL_HOURS} hours):\n${link}\n\nIf you did not request this, you can safely ignore this email.`,
    {
      html: `<p>Hello ${user.name},</p><p>We received a request to reset your password.</p><p><a href="${link}">Reset your password</a> (link valid ${RESET_TTL_HOURS} hours).</p><p>If you did not request this, you can safely ignore this email.</p>`,
    },
  );
  return { sent: true };
}

// Look up a still-valid RESET by token.
export async function findValidReset(token: string) {
  if (!token) return null;
  const inv = await prisma.clientInvite.findUnique({ where: { token } });
  if (!inv || inv.type !== "RESET") return null;
  if (inv.usedAt) return null;
  if (inv.expiresAt < new Date()) return null;
  return inv;
}

export function markUsed(token: string) {
  return prisma.clientInvite.update({ where: { token }, data: { usedAt: new Date() } });
}

// Password policy shared by register + reset. Returns an error message or null.
export function passwordError(pw: string): string | null {
  if (typeof pw !== "string" || pw.length < 8) return "Password must be at least 8 characters";
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return "Password must contain letters and numbers";
  return null;
}

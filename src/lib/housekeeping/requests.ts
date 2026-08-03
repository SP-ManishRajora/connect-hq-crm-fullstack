// Cleaning-request lifecycle, SLA, priority and complaint-conversion rules.
// Brief §§23–35.

import { prisma } from "@/lib/db";
import { randomBytes } from "crypto";
import { HttpError } from "./types";
import { getRequestConfig } from "./settings";

export type CrStatus =
  | "NEW" | "ASSIGNED" | "ACCEPTED" | "ON_THE_WAY" | "IN_PROGRESS"
  | "COMPLETED" | "AWAITING_CONFIRMATION" | "CLOSED" | "REOPENED" | "CANCELLED";

// Legal transitions. An illegal move is a 409, never a silent no-op — the same
// rule as the issue state machine, for the same reason.
const TRANSITIONS: Record<CrStatus, CrStatus[]> = {
  NEW:                   ["ASSIGNED", "ACCEPTED", "CANCELLED"],
  ASSIGNED:              ["ACCEPTED", "ASSIGNED", "ON_THE_WAY", "CANCELLED"],
  ACCEPTED:              ["ON_THE_WAY", "IN_PROGRESS", "ASSIGNED", "CANCELLED"],
  ON_THE_WAY:            ["IN_PROGRESS", "ASSIGNED", "CANCELLED"],
  IN_PROGRESS:           ["COMPLETED", "ASSIGNED", "CANCELLED"],
  COMPLETED:             ["AWAITING_CONFIRMATION", "CLOSED", "REOPENED"],
  AWAITING_CONFIRMATION: ["CLOSED", "REOPENED"],
  REOPENED:              ["ASSIGNED", "ACCEPTED", "IN_PROGRESS", "CANCELLED"],
  CLOSED:                [],   // terminal
  CANCELLED:             [],   // terminal
};

export function assertCrTransition(from: CrStatus, to: CrStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(409, `Cannot move a request from ${from} to ${to}.`);
  }
}

export const CR_STATUS_META: Record<CrStatus, { label: string; cls: string; client: string }> = {
  NEW:                   { label: "New",              cls: "bg-gray-100 text-gray-700",     client: "Request received" },
  ASSIGNED:              { label: "Assigned",         cls: "bg-blue-100 text-blue-800",     client: "Housekeeping assigned" },
  ACCEPTED:              { label: "Accepted",         cls: "bg-blue-100 text-blue-800",     client: "Housekeeping assigned" },
  ON_THE_WAY:            { label: "On the way",       cls: "bg-indigo-100 text-indigo-800", client: "Staff on the way" },
  IN_PROGRESS:           { label: "In progress",      cls: "bg-indigo-100 text-indigo-800", client: "Cleaning in progress" },
  COMPLETED:             { label: "Completed",        cls: "bg-violet-100 text-violet-800", client: "Request completed" },
  AWAITING_CONFIRMATION: { label: "Awaiting client",  cls: "bg-violet-100 text-violet-800", client: "Please confirm" },
  CLOSED:                { label: "Closed",           cls: "bg-emerald-100 text-emerald-800", client: "Closed" },
  REOPENED:              { label: "Reopened",         cls: "bg-rose-100 text-rose-800",     client: "Reopened" },
  CANCELLED:             { label: "Cancelled",        cls: "bg-gray-100 text-gray-500",     client: "Cancelled" },
};

// Words that force URGENT regardless of what the client picked (brief §25).
const URGENT_PATTERNS: { pattern: string; reason: string }[] = [
  { pattern: "spill", reason: "liquid spill" },
  { pattern: "wet floor", reason: "wet floor — slip risk" },
  { pattern: "slippery", reason: "slip risk" },
  { pattern: "broken glass", reason: "broken glass" },
  { pattern: "glass broken", reason: "broken glass" },
  { pattern: "overflow", reason: "overflow" },
  { pattern: "vomit", reason: "biological waste" },
  { pattern: "blood", reason: "biological waste" },
  { pattern: "urine", reason: "biological waste" },
  { pattern: "faece", reason: "biological waste" },
  { pattern: "feces", reason: "biological waste" },
  { pattern: "smell", reason: "strong foul smell" },
  { pattern: "stink", reason: "strong foul smell" },
  { pattern: "leak", reason: "leak — possible safety risk" },
  { pattern: "smoke", reason: "safety risk" },
  { pattern: "fire", reason: "safety risk" },
  { pattern: "shock", reason: "electrical safety risk" },
  { pattern: "meeting", reason: "client meeting in progress" },
];

export function detectUrgency(
  text: string,
  typeAutoUrgent: boolean,
): { urgent: boolean; reason: string | null } {
  if (typeAutoUrgent) return { urgent: true, reason: "request type is always urgent" };
  const hay = text.toLowerCase();
  const hit = URGENT_PATTERNS.find((p) => hay.includes(p.pattern));
  return hit ? { urgent: true, reason: hit.reason } : { urgent: false, reason: null };
}

// Human-readable ticket number: CR-YYMM-NNNN, sequential within the month.
export async function nextTicketNo(): Promise<string> {
  const now = new Date();
  const prefix = `CR-${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const last = await prisma.cleaningRequest.findFirst({
    where: { ticketNo: { startsWith: prefix } },
    orderBy: { ticketNo: "desc" },
    select: { ticketNo: true },
  });
  const n = last ? parseInt(last.ticketNo.split("-")[2] ?? "0", 10) + 1 : 1;
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

export function newStatusToken(): string {
  return randomBytes(16).toString("base64url");
}

// Auto-assignment (brief §27). Without HkStaff rosters there is no shift or
// availability data, so this picks the eligible person at the centre with the
// fewest open requests — a real workload balance, just not shift-aware yet.
// See D-06 / D-19.
export async function pickAssignee(centerId: string): Promise<string | null> {
  const cfg = await getRequestConfig();
  if (cfg.defaultAssigneeByCenter[centerId]) return cfg.defaultAssigneeByCenter[centerId];
  if (!cfg.autoAssign) return null;

  const candidates = await prisma.user.findMany({
    where: {
      active: true,
      role: { in: ["OPS", "CENTER_MANAGER"] },
      OR: [{ centerId }, { centerId: null }],
    },
    select: { id: true },
  });
  if (candidates.length === 0) return null;

  const loads = await Promise.all(
    candidates.map(async (c) => ({
      id: c.id,
      load: await prisma.cleaningRequest.count({
        where: {
          assigneeId: c.id,
          status: { notIn: ["CLOSED", "CANCELLED", "COMPLETED", "AWAITING_CONFIRMATION"] },
        },
      }),
    })),
  );
  loads.sort((a, b) => a.load - b.load);
  return loads[0]?.id ?? null;
}

export function dueFrom(slaMinutes: number, urgent: boolean, from = new Date()): Date {
  // Urgent halves the target, floored at 5 minutes.
  const mins = urgent ? Math.max(5, Math.round(slaMinutes / 2)) : slaMinutes;
  return new Date(from.getTime() + mins * 60_000);
}

// Records a status change plus its trail entry in one place.
export async function transition(
  requestId: string,
  to: CrStatus,
  opts: {
    actorId?: string | null;
    byClient?: boolean;
    note?: string | null;
    extra?: Record<string, unknown>;
  } = {},
) {
  const current = await prisma.cleaningRequest.findUnique({
    where: { id: requestId },
    select: { status: true },
  });
  if (!current) throw new HttpError(404, "Request not found");

  assertCrTransition(current.status as CrStatus, to);

  const [row] = await prisma.$transaction([
    prisma.cleaningRequest.update({
      where: { id: requestId },
      data: { status: to, ...(opts.extra ?? {}) },
    }),
    prisma.cleaningRequestEvent.create({
      data: {
        requestId,
        fromStatus: current.status,
        toStatus: to,
        actorId: opts.actorId ?? null,
        byClient: opts.byClient ?? false,
        note: opts.note ?? null,
      },
    }),
  ]);
  return row;
}

// Complaint conversion (brief §33). Returns the reason when a request should
// become a complaint, or null.
export function complaintReason(r: {
  slaBreached: boolean;
  reopenCount: number;
  confirmation: string | null;
  isComplaint: boolean;
}): string | null {
  if (r.isComplaint) return null;
  if (r.confirmation === "NOT_COMPLETED") return "Client reported the work as not completed";
  if (r.reopenCount > 0) return "Client reopened the request";
  if (r.slaBreached) return "Service-level target was breached";
  return null;
}

export async function markComplaint(requestId: string, reason: string) {
  return prisma.cleaningRequest.update({
    where: { id: requestId },
    data: { isComplaint: true, complaintReason: reason, convertedAt: new Date() },
  });
}

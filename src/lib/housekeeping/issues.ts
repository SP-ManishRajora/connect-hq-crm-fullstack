// Issue lifecycle: severity → SLA, the legal state transitions, and the single
// creation entry point shared by every source (inspection, AI, client, manual).

import { prisma } from "@/lib/db";
import { HttpError } from "./types";
import { getIssueConfig } from "./settings";

export type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type IssueStatus =
  | "OPEN" | "ASSIGNED" | "IN_PROGRESS" | "AWAITING_VERIFICATION"
  | "CLOSED" | "REJECTED" | "CANCELLED";

export const SEVERITIES: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export const CATEGORIES = [
  "cleanliness", "maintenance", "safety", "consumables", "presentation",
] as const;

// Issue titles that the brief lists as inherently critical (§10). Matching is
// substring-based on a normalised title so a supervisor typing "exposed wire near
// panel" still trips the fast path.
const CRITICAL_PATTERNS = [
  "exposed wire", "open electrical panel", "open panel", "electrical panel",
  "water leakage near", "leak near electric", "diesel leak", "fuel leak",
  "blocked emergency", "blocked exit", "fire exit blocked",
  "major water overflow", "sewage", "gas leak", "live wire",
];

// Returns true when the text describes a hazard that must bypass normal
// triage regardless of the severity the reporter chose.
export function isCriticalByNature(title: string, description?: string | null): boolean {
  const hay = `${title} ${description ?? ""}`.toLowerCase();
  return CRITICAL_PATTERNS.some((p) => hay.includes(p));
}

// Due time = now + SLA hours for the severity. Configurable via HkSetting.
export async function computeDueAt(severity: Severity, from = new Date()): Promise<Date> {
  const cfg = await getIssueConfig();
  const hours = cfg.slaHours[severity] ?? 24;
  return new Date(from.getTime() + hours * 3600_000);
}

// --- State machine ---------------------------------------------------------
// Explicit rather than implicit: an illegal transition is a 409, never a silent
// no-op, so a double-tap in the field can't corrupt an issue's history.
const TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  OPEN:                  ["ASSIGNED", "CANCELLED"],
  ASSIGNED:              ["IN_PROGRESS", "ASSIGNED", "OPEN", "CANCELLED"],
  IN_PROGRESS:           ["AWAITING_VERIFICATION", "ASSIGNED", "CANCELLED"],
  AWAITING_VERIFICATION: ["CLOSED", "REJECTED"],
  REJECTED:              ["IN_PROGRESS", "ASSIGNED", "CANCELLED"],
  CLOSED:                [],       // terminal — reopening creates a NEW issue
  CANCELLED:             [],       // terminal
};

export function assertTransition(from: IssueStatus, to: IssueStatus) {
  if (!TRANSITIONS[from]?.includes(to)) {
    throw new HttpError(
      409,
      `Cannot move an issue from ${from} to ${to}.`,
    );
  }
}

export type CreateIssueInput = {
  centerId: string;
  locationId?: string | null;
  visitId?: string | null;
  source: "INSPECTION" | "AI" | "CLIENT" | "MANUAL";
  category: string;
  title: string;
  description?: string | null;
  severity: Severity;
  beforePhotoId?: string | null;
  assigneeId?: string | null;
  raisedById: string;
};

// The single creation path. Phase 5 (AI) and Phase 9 (client requests) call this
// with their own `source` rather than duplicating the SLA/escalation logic.
export async function createIssue(input: CreateIssueInput) {
  // A hazard keeps the higher of (reported severity, CRITICAL).
  const severity: Severity = isCriticalByNature(input.title, input.description)
    ? "CRITICAL"
    : input.severity;

  const assigned = Boolean(input.assigneeId);
  const dueAt = await computeDueAt(severity);

  return prisma.hkIssue.create({
    data: {
      centerId: input.centerId,
      locationId: input.locationId ?? null,
      visitId: input.visitId ?? null,
      source: input.source,
      category: input.category,
      title: input.title,
      description: input.description ?? null,
      severity,
      status: assigned ? "ASSIGNED" : "OPEN",
      beforePhotoId: input.beforePhotoId ?? null,
      assigneeId: input.assigneeId ?? null,
      raisedById: input.raisedById,
      dueAt,
    },
    include: {
      location: { select: { id: true, name: true } },
      assignee: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
    },
  });
}

// Four-eyes rule: whoever did the work cannot sign it off.
export function assertCanVerify(issue: { assigneeId: string | null }, userId: string, role: string) {
  if (issue.assigneeId && issue.assigneeId === userId && role !== "ADMIN" && role !== "OWNER") {
    throw new HttpError(
      403,
      "You cannot verify your own work — ask a colleague or a manager to sign it off.",
    );
  }
}

export function isOverdue(issue: { dueAt: Date | null; status: string }): boolean {
  if (!issue.dueAt) return false;
  if (["CLOSED", "CANCELLED"].includes(issue.status)) return false;
  return issue.dueAt.getTime() < Date.now();
}

export const SEVERITY_META: Record<Severity, { label: string; cls: string; dot: string }> = {
  CRITICAL: { label: "Critical", cls: "bg-rose-100 text-rose-800",    dot: "bg-rose-600" },
  HIGH:     { label: "High",     cls: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  MEDIUM:   { label: "Medium",   cls: "bg-amber-100 text-amber-800",   dot: "bg-amber-500" },
  LOW:      { label: "Low",      cls: "bg-sky-100 text-sky-800",       dot: "bg-sky-500" },
};

export const STATUS_META: Record<IssueStatus, { label: string; cls: string }> = {
  OPEN:                  { label: "Open",            cls: "bg-gray-100 text-gray-700" },
  ASSIGNED:              { label: "Assigned",        cls: "bg-blue-100 text-blue-800" },
  IN_PROGRESS:           { label: "In progress",     cls: "bg-indigo-100 text-indigo-800" },
  AWAITING_VERIFICATION: { label: "Awaiting check",  cls: "bg-violet-100 text-violet-800" },
  CLOSED:                { label: "Closed",          cls: "bg-emerald-100 text-emerald-800" },
  REJECTED:              { label: "Rework needed",   cls: "bg-rose-100 text-rose-800" },
  CANCELLED:             { label: "Cancelled",       cls: "bg-gray-100 text-gray-500" },
};

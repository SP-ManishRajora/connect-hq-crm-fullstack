// Single source of truth for lead pipeline status transitions.
// Status is stored as a plain string on Lead. A lead may move to ANY other
// status (forward, backward, or skipping stages), but every change requires a comment.

export const LEAD_STAGES = [
  "Lead",
  "Connect",
  "Visit Planned",
  "Visited",
  "Proposal",
  "Accepted",
  "Payment",
  "Renewable",
] as const;

export const LEAD_LOST = "Lost";

// All statuses a lead can hold, in display order.
export const ALL_STATUSES: string[] = [...LEAD_STAGES, LEAD_LOST];

// Returns the statuses a lead may move to from its current status:
// any status other than the one it's already in.
export function allowedNextStatuses(current: string): string[] {
  return ALL_STATUSES.filter((s) => s !== current);
}

export function canTransition(from: string, to: string): boolean {
  return from !== to && ALL_STATUSES.includes(to);
}

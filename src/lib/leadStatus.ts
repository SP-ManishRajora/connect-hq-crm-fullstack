// Single source of truth for lead pipeline status transitions.
// Status is stored as a plain string on Lead. Stages advance one step at a time.
// "Lost" is only reachable from the first stage ("Lead"); after that the pipeline is linear.

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

// Returns the statuses a lead may move to from its current status.
// - First stage ("Lead"): next pipeline stage OR "Lost".
// - Any later pipeline stage: only the next pipeline stage.
// - Last stage ("Renewable"), "Lost", or unknown status: no transitions.
export function allowedNextStatuses(current: string): string[] {
  if (current === LEAD_LOST) return [];
  const i = LEAD_STAGES.indexOf(current as (typeof LEAD_STAGES)[number]);
  if (i === -1) return [];
  const out: string[] = [];
  if (i + 1 < LEAD_STAGES.length) out.push(LEAD_STAGES[i + 1]);
  if (current === LEAD_STAGES[0]) out.push(LEAD_LOST);
  return out;
}

export function canTransition(from: string, to: string): boolean {
  return allowedNextStatuses(from).includes(to);
}

// Helper: can the current user manage this center?
// - ADMIN / OWNER → yes for any center.
// - CENTER_MANAGER → yes if their centerId matches.
// - everyone else → no.

import type { SessionUser } from "./auth";

export function canManageCenter(user: SessionUser | null | undefined, centerId: string): boolean {
  if (!user) return false;
  if (user.role === "ADMIN" || user.role === "OWNER") return true;
  if (user.role === "CENTER_MANAGER" && user.centerId === centerId) return true;
  return false;
}

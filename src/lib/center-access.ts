// Helper: can the current user manage this center?
// - ADMIN / OWNER / CENTER_MANAGER → yes for any center.
// - everyone else → no.

import type { SessionUser } from "./auth";

export function canManageCenter(user: SessionUser | null | undefined, _centerId: string): boolean {
  if (!user) return false;
  return user.role === "ADMIN" || user.role === "OWNER" || user.role === "CENTER_MANAGER";
}

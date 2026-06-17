export const ROLES = {
  ADMIN: "ADMIN", OWNER: "OWNER", MANAGER: "MANAGER", SALES: "SALES", OPS: "OPS",
  CENTER_MANAGER: "CENTER_MANAGER", ACCOUNTS: "ACCOUNTS", IT: "IT", CLIENT: "CLIENT",
} as const;
export type Role = keyof typeof ROLES;

export const MODULE_ACCESS: Record<string, Role[]> = {
  dashboard:    ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT"],
  leads:        ["ADMIN", "OWNER", "MANAGER", "SALES"],
  visitors:     ["ADMIN", "OWNER", "MANAGER", "SALES", "CENTER_MANAGER"],
  proposals:    ["ADMIN", "OWNER", "MANAGER", "SALES"],
  clients:      ["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS"],
  bulk_import:  ["ADMIN", "OWNER", "MANAGER", "SALES", "ACCOUNTS"],
  contracts:    ["ADMIN", "OWNER", "MANAGER", "ACCOUNTS"],
  contracts_inbox: ["ADMIN", "OWNER", "ACCOUNTS"],
  vendors:      ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER", "ACCOUNTS"],
  procurement:  ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER", "ACCOUNTS"],
  vendor_invoices: ["ADMIN", "OWNER", "OPS", "ACCOUNTS"],
  inventory:    ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER"],
  repairs:      ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER", "IT"],
  recurring:    ["ADMIN", "OWNER", "OPS", "ACCOUNTS"],
  invoices:     ["ADMIN", "OWNER", "MANAGER", "ACCOUNTS"],
  bookings:     ["ADMIN", "OWNER", "CENTER_MANAGER", "OPS", "SALES", "CLIENT"],
  tickets:      ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER", "IT"],
  notices:      ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"],
  referrals:    ["ADMIN", "OWNER", "MANAGER", "SALES", "ACCOUNTS"],
  accounts:     ["ADMIN", "OWNER", "ACCOUNTS"],
  attendance:   ["ADMIN", "OWNER", "OPS", "CENTER_MANAGER"],
  my_attendance:["ADMIN", "OWNER", "MANAGER", "SALES", "OPS", "CENTER_MANAGER", "ACCOUNTS", "IT"],
  staff_attendance: ["ADMIN", "OWNER", "MANAGER", "CENTER_MANAGER"],
  leave_management: ["ADMIN", "OWNER"],
  sops:         ["ADMIN", "OWNER", "MANAGER", "OPS", "CENTER_MANAGER", "IT", "ACCOUNTS", "SALES"],
  centers:      ["ADMIN", "OWNER", "CENTER_MANAGER"],   // CM can see list but only setup their own
  users:        ["ADMIN", "OWNER"],
  seatmap:      ["ADMIN", "OWNER", "MANAGER", "SALES", "CENTER_MANAGER"],
  cashflow:     ["ADMIN"],
  audit_logs:   ["ADMIN", "OWNER"],
  client_portal:["CLIENT"],
};

export const ALL_MODULES = Object.keys(MODULE_ACCESS);

export function canAccess(role: string | undefined | null, mod: string, allowedModules?: string[] | null | undefined): boolean {
  if (allowedModules && allowedModules.length > 0) return allowedModules.includes(mod);
  if (!role) return false;
  const allowed = MODULE_ACCESS[mod];
  return Boolean(allowed && allowed.includes(role as Role));
}

export function requireRole(role: string | undefined | null, allowed: Role[]) {
  return Boolean(role && allowed.includes(role as Role));
}

export function parseAllowedModules(json?: string | null): string[] | null {
  if (!json) return null;
  try { const a = JSON.parse(json); return Array.isArray(a) ? a : null; } catch { return null; }
}

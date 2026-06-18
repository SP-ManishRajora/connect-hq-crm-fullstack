// Shared validators (used by both client UI and API routes) so the rules stay identical.

// Indian mobile number: 10 digits starting 6-9, optionally with +91 / 91 / 0 prefix.
// Accepts spaces, hyphens, and a leading "+" in the raw input.
export function isValidIndianPhone(raw: string): boolean {
  const digits = String(raw).replace(/[\s-]/g, "").replace(/^\+/, "");
  // strip country code (91) or trunk prefix (0) if present
  const local = digits.replace(/^91/, "").replace(/^0/, "");
  return /^[6-9]\d{9}$/.test(local);
}

// Normalise to the bare 10-digit local number (or null if not valid).
export function normaliseIndianPhone(raw: string): string | null {
  if (!isValidIndianPhone(raw)) return null;
  const digits = String(raw).replace(/[\s-]/g, "").replace(/^\+/, "");
  return digits.replace(/^91/, "").replace(/^0/, "");
}

// Standard email format.
export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw).trim());
}

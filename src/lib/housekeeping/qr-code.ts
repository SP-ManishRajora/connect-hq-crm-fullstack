// Pure QR-code string handling, shared by the browser scanner and the server
// resolver. No Prisma and no "use client" — importing the server resolver into a
// client component would pull the database client into the browser bundle, and
// duplicating this parsing is how the two sides drift apart.

/**
 * A QR may hold a full URL or the bare code. Scanners hand us whichever the
 * camera read, so normalise to the trailing path segment.
 *
 * `/qr/a/8Kd2p_Qa91xZ` and `/housekeeping/scan/8Kd2p_Qa91xZ` both reduce to the
 * code, and a bare code passes through untouched.
 */
export function extractCode(value: string): string {
  const v = value.trim();
  try {
    const parts = new URL(v).pathname.split("/").filter(Boolean);
    return parts[parts.length - 1] || v;
  } catch {
    return v;
  }
}

import { readFileSync } from "fs";
import path from "path";
import { sendMail } from "../src/lib/mail";

// Load .env by hand — dotenv is not a dependency of this project, and adding one
// for a test script would be a poor trade. Next injects these at runtime; a plain
// script does not get that, so it reads the same file itself.
function loadEnv() {
  try {
    const raw = readFileSync(path.join(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, key, rawVal] = m;
      if (process.env[key]) continue; // a real environment variable wins
      process.env[key] = rawVal.trim().replace(/^["'](.*)["']$/, "$1");
    }
  } catch {
    // No .env — fall through and report the missing values below.
  }
}
loadEnv();

// Sends one real email to prove the SMTP settings work, and reports the exact
// reason when they do not.
//
// Worth having as a script rather than a curl against a route: this isolates
// delivery from everything else. If this passes and OTP mail still doesn't
// arrive, the problem is the flow, not the mail server.
//
//   npx tsx scripts/test-mail.ts you@example.com

const to = process.argv[2];

if (!to) {
  console.error("Usage: npx tsx scripts/test-mail.ts <recipient@example.com>");
  process.exit(1);
}

function mask(v: string | undefined): string {
  if (!v) return "(empty)";
  return v.length <= 4 ? "****" : `${v.slice(0, 2)}${"*".repeat(v.length - 2)} (${v.length} chars)`;
}

async function main() {
  console.log("SMTP configuration:");
  console.log("  host:", process.env.SMTP_HOST || "(empty)");
  console.log("  port:", process.env.SMTP_PORT || "(empty)");
  console.log("  user:", process.env.SMTP_USER || "(empty)");
  console.log("  pass:", mask(process.env.SMTP_PASS));
  console.log("  from:", process.env.SMTP_FROM || "(empty)");
  console.log("  secure:", Number(process.env.SMTP_PORT) === 465, "(implicit TLS when port is 465)");
  console.log();

  if (!process.env.SMTP_HOST) {
    console.error("SMTP_HOST is empty — mail.ts will log to the console instead of sending.");
    process.exit(1);
  }
  if (!process.env.SMTP_PASS) {
    console.error("SMTP_PASS is empty — paste the Zoho app password into .env first.");
    process.exit(1);
  }

  console.log(`Sending to ${to} …`);
  const stamp = new Date().toISOString();

  try {
    const r = await sendMail(
      to,
      `Connect HQ ERP — SMTP test ${stamp}`,
      `This is a test message from the Coworking ERP.\n\n` +
        `If you are reading it, outbound email works: sign-in codes, ` +
        `visitor check-in codes and invoice mail will all be delivered.\n\n` +
        `Sent at ${stamp}.`,
    );

    if (r.sent) {
      console.log("\n✅ Accepted by the mail server.");
      console.log("   Check the inbox — and the spam folder, which is where");
      console.log("   unauthenticated mail lands until SPF/DKIM are set up.");
    } else {
      console.log("\n⚠️  Not sent:", "reason" in r ? r.reason : "unknown");
    }
  } catch (e: unknown) {
    const err = e as { code?: string; responseCode?: number; message?: string };
    console.error("\n❌ Send failed:", err.message ?? e);

    // Zoho's common rejections, translated. The raw codes are unhelpful on their own.
    const hint =
      err.responseCode === 535 || /535|auth/i.test(err.message ?? "")
        ? "Authentication rejected. Either the app password is wrong, or you generated it\n" +
          "   under a different mailbox than SMTP_USER, or the datacentre host is wrong\n" +
          "   (smtp.zoho.in for accounts.zoho.in, smtp.zoho.com for .com)."
        : err.responseCode === 553 || /553|relay/i.test(err.message ?? "")
          ? "Relaying disallowed. SMTP_FROM must be an address this Zoho account owns."
          : err.code === "ETIMEDOUT" || err.code === "ESOCKET" || err.code === "ECONNREFUSED"
            ? "Could not reach the server. Outbound port 465 may be blocked here —\n" +
              "   try SMTP_PORT=587, which mail.ts switches to STARTTLS automatically."
            : null;

    if (hint) console.error("\n   " + hint);
    process.exit(1);
  }
}

main();

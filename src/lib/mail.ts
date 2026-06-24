// Email sending — server-only (imported only by API routes). Kept out of @/lib/utils so
// client components that import formatters from utils don't drag nodemailer (and Node's
// `fs`) into the client bundle.
//
// Sends via SMTP when configured (SMTP_HOST set); otherwise logs to the console so
// local/dev flows still work. `body` is plain text; pass `opts.html` for an HTML body.
export async function sendMail(
  to: string,
  subject: string,
  body: string,
  opts: { html?: string; replyTo?: string } = {},
) {
  if (!process.env.SMTP_HOST) {
    console.log(`\n📧 [EMAIL — not sent, SMTP not configured] To: ${to}\nSubject: ${subject}\n${body}\n`);
    return { sent: false, reason: "SMTP not configured" as const };
  }

  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465, // 465 = implicit TLS
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: body,
    html: opts.html,
    replyTo: opts.replyTo,
  });
  return { sent: true as const };
}

import { redirect } from "next/navigation";

// Legacy landing for staff-only QR printouts (`/housekeeping/scan/<code>`).
//
// Every area now carries ONE sticker, and `/qr/a/<code>` is the single destination
// that decides what to offer based on who scanned it. Old printouts stay valid by
// redirecting there: the resolver accepts staff codes, and an unrecognised or
// retired code is reported by that page rather than duplicated here.
//
// The login gate moves with it — `/qr/a/*` is public, and a staff member who is
// signed in gets the chooser instead of the client form.
export default function ScanLanding({ params }: { params: { code: string } }) {
  redirect(`/qr/a/${encodeURIComponent(params.code)}`);
}

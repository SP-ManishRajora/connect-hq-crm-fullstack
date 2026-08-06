import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import QRCode from "qrcode";
import PrintButton from "./PrintButton";

export const dynamic = "force-dynamic";

// The QR encodes /qr/a/<code> — the SAME destination as the client sheet. One
// sticker per area: the landing page decides what to offer from the session, so
// nobody has to be taught which QR is theirs. This sheet exists for the staff
// copy (it prints the raw code for manual entry); the sticker itself is
// interchangeable with the client one.
//
// The code segment is opaque and random — it identifies the location only through
// a server-side lookup, so a photographed QR discloses nothing about the area.
function scanUrl(code: string) {
  const base = process.env.APP_URL || "";
  return `${base}/qr/a/${code}`;
}

export default async function QrSheetPage({
  searchParams,
}: {
  searchParams: { centerId?: string; locationId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_admin", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const centerId = searchParams.centerId;
  if (!centerId) redirect("/housekeeping/setup");

  const center = await prisma.center.findUnique({
    where: { id: centerId },
    select: { id: true, name: true, city: true },
  });
  if (!center) redirect("/housekeeping/setup");

  // A locationId narrows the sheet to one area — used by the per-row Print action so
  // a rotated code can be reprinted without reprinting the whole centre. Paused areas
  // are still printable when asked for by id; the unfiltered sheet stays active-only.
  const single = searchParams.locationId;

  const locations = await prisma.inspectionLocation.findMany({
    where: single
      ? { id: single, centerId, deletedAt: null }
      : { centerId, deletedAt: null, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      qrCodes: { where: { active: true }, select: { code: true, version: true }, take: 1 },
    },
  });

  // Render each QR to inline SVG on the server — no client-side library, no
  // external image requests when printing.
  const cards = await Promise.all(
    locations
      .filter((l) => l.qrCodes[0])
      .map(async (l) => ({
        id: l.id,
        name: l.name,
        category: l.category.replace(/_/g, " "),
        code: l.qrCodes[0].code,
        version: l.qrCodes[0].version,
        svg: await QRCode.toString(scanUrl(l.qrCodes[0].code), {
          type: "svg",
          errorCorrectionLevel: "M",
          margin: 1,
          width: 220,
        }),
      })),
  );

  return (
    <div className="max-w-5xl">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .qr-card { break-inside: avoid; page-break-inside: avoid; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      <div className="no-print mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {single && cards[0] ? `QR — ${cards[0].name}` : `QR Sheet — ${center.name}`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {single ? (
              <>
                Single area at {center.name}. Print, cut, and fix it at the area.{" "}
                <a href={`/housekeeping/setup/qr-sheet?centerId=${center.id}`} className="underline">
                  Print the whole centre instead
                </a>
                .
              </>
            ) : (
              <>
                {cards.length} code{cards.length === 1 ? "" : "s"}. Print, cut, and fix each one at
                its area. Reprint whenever a code is rotated.
              </>
            )}
          </p>
        </div>
        <PrintButton />
      </div>

      {cards.length === 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {single
            ? "This area has no active QR code. Generate one with New QR on the setup screen."
            : "No active QR codes for this centre yet. Generate them from the setup screen."}
        </div>
      )}

      <div
        className={
          single ? "max-w-[280px]" : "grid grid-cols-2 md:grid-cols-3 gap-4"
        }
      >
        {cards.map((c) => (
          <div key={c.id} className="qr-card rounded-lg border bg-white p-4 text-center">
            <div className="text-xs uppercase tracking-wider text-gray-500">{center.name}</div>
            <div className="font-semibold text-lg leading-tight mt-0.5">{c.name}</div>
            <div className="text-[10px] text-gray-500 mb-2">{c.category}</div>
            <div
              className="flex justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-[180px]"
              dangerouslySetInnerHTML={{ __html: c.svg }}
            />
            <div className="mt-2 font-mono text-[10px] text-gray-500 break-all">{c.code}</div>
            <div className="text-[9px] text-gray-400">v{c.version}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

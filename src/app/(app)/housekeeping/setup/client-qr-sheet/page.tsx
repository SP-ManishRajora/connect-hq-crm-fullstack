import { getSessionUser } from "@/lib/auth";
import { canAccessAsync } from "@/lib/roles";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import QRCode from "qrcode";
import PrintButton from "../qr-sheet/PrintButton";

export const dynamic = "force-dynamic";

// THE area sticker — one per area, for everyone. The wording is client-facing
// because a member is the most likely scanner and the least likely to be trained,
// but staff scanning this same code land on their own chooser instead of the
// request form. There is no second sticker to confuse it with.
function clientUrl(code: string) {
  return `${process.env.APP_URL || ""}/qr/a/${code}`;
}

export default async function ClientQrSheet({
  searchParams,
}: {
  searchParams: { centerId?: string; locationId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!(await canAccessAsync(me.role, "hk_admin", me.allowedModules))) redirect("/dashboard");

  const centerId = searchParams.centerId;
  if (!centerId) redirect("/housekeeping/setup");

  const center = await prisma.center.findUnique({
    where: { id: centerId }, select: { id: true, name: true },
  });
  if (!center) redirect("/housekeeping/setup");

  // A locationId narrows the sheet to one area, so a rotated code can be reprinted
  // without reprinting the whole centre. Paused areas are still printable when
  // asked for by id; the unfiltered sheet stays active-only.
  const single = searchParams.locationId;

  const locations = await prisma.inspectionLocation.findMany({
    where: single
      ? { id: single, centerId, deletedAt: null }
      : { centerId, deletedAt: null, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      clientQrCodes: { where: { active: true }, select: { code: true, version: true }, take: 1 },
    },
  });

  const cards = await Promise.all(
    locations
      .filter((l) => l.clientQrCodes[0])
      .map(async (l) => ({
        id: l.id,
        name: l.name,
        code: l.clientQrCodes[0].code,
        version: l.clientQrCodes[0].version,
        svg: await QRCode.toString(clientUrl(l.clientQrCodes[0].code), {
          type: "svg", errorCorrectionLevel: "M", margin: 1, width: 240,
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
            {single && cards[0] ? `Area QR — ${cards[0].name}` : `Area QR Sheet — ${center.name}`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {single ? (
              <>
                Single area at {center.name}. Print, cut, and fix it at the area.{" "}
                <a href={`/housekeeping/setup/client-qr-sheet?centerId=${center.id}`} className="underline">
                  Print the whole centre instead
                </a>
                .
              </>
            ) : (
              <>
                {cards.length} code{cards.length === 1 ? "" : "s"} — <strong>one sticker per area</strong>,
                scanned by members and staff alike. Members get the request form; signed-in staff get
                inspection and completion options. Reprint whenever a code is rotated.
              </>
            )}
          </p>
        </div>
        <PrintButton />
      </div>

      {cards.length === 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {single
            ? "This area has no active code. Generate one with Area QR on the setup screen."
            : "No area codes for this centre yet. Generate them with Area QR on the setup screen."}
        </div>
      )}

      <div className={single ? "max-w-[280px]" : "grid grid-cols-2 md:grid-cols-3 gap-4"}>
        {cards.map((c) => (
          <div key={c.id} className="qr-card rounded-lg border-2 border-brand-200 bg-white p-4 text-center">
            <div className="text-sm font-semibold text-brand-700">Need something cleaned?</div>
            <div className="text-[11px] text-gray-500 mb-2">Scan · no app or login needed</div>
            <div className="flex justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-[170px]"
              dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="mt-2 font-semibold text-sm">{c.name}</div>
            <div className="text-[10px] text-gray-400">{center.name}</div>
            {/* Printed so staff can type it when a camera fails — the completion and
                inspection screens both accept a typed code. */}
            <div className="mt-2 font-mono text-[10px] text-gray-500 break-all">{c.code}</div>
            <div className="text-[9px] text-gray-400">v{c.version}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

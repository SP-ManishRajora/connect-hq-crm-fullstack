import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import QRCode from "qrcode";
import PrintButton from "../qr-sheet/PrintButton";

export const dynamic = "force-dynamic";

// CLIENT-facing QR sheet — deliberately distinct in wording and layout from the
// staff sheet so the two stickers are never confused on a wall.
function clientUrl(code: string) {
  return `${process.env.APP_URL || ""}/qr/a/${code}`;
}

export default async function ClientQrSheet({
  searchParams,
}: {
  searchParams: { centerId?: string };
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canAccess(me.role, "hk_admin", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const centerId = searchParams.centerId;
  if (!centerId) redirect("/housekeeping/setup");

  const center = await prisma.center.findUnique({
    where: { id: centerId }, select: { id: true, name: true },
  });
  if (!center) redirect("/housekeeping/setup");

  const locations = await prisma.inspectionLocation.findMany({
    where: { centerId, deletedAt: null, active: true },
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
          <h1 className="text-2xl font-semibold">Client QR Sheet — {center.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {cards.length} code{cards.length === 1 ? "" : "s"} for <strong>clients</strong> to scan.
            These are separate from the staff inspection codes — display them where members can see them.
          </p>
        </div>
        <PrintButton />
      </div>

      {cards.length === 0 && (
        <div className="no-print rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No client QR codes yet. Run <code className="text-xs">npm run db:seed:cr</code> to generate them.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.id} className="qr-card rounded-lg border-2 border-brand-200 bg-white p-4 text-center">
            <div className="text-sm font-semibold text-brand-700">Need something cleaned?</div>
            <div className="text-[11px] text-gray-500 mb-2">Scan · no app or login needed</div>
            <div className="flex justify-center [&>svg]:w-full [&>svg]:h-auto [&>svg]:max-w-[170px]"
              dangerouslySetInnerHTML={{ __html: c.svg }} />
            <div className="mt-2 font-semibold text-sm">{c.name}</div>
            <div className="text-[10px] text-gray-400">{center.name}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

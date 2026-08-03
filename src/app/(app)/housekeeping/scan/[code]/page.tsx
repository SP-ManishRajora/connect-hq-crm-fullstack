import { getSessionUser } from "@/lib/auth";
import { canAccess, parseAllowedModules } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Landing page for a QR opened with the phone's native camera app (rather than
// the in-app scanner). Resolves the code, then hands off to the inspect flow
// with the code pre-filled.
export default async function ScanLanding({ params }: { params: { code: string } }) {
  const me = await getSessionUser();
  if (!me) redirect(`/login?next=/housekeeping/scan/${params.code}`);
  if (!canAccess(me.role, "hk_inspect", parseAllowedModules(me.allowedModules))) redirect("/dashboard");

  const qr = await prisma.locationQrCode.findUnique({
    where: { code: params.code },
    include: {
      location: { include: { center: { select: { name: true } } } },
    },
  });

  if (!qr || !qr.location || qr.location.deletedAt) {
    return (
      <Frame title="Unrecognised code">
        This QR code isn&apos;t registered. It may belong to another system, or the area may have
        been removed.
      </Frame>
    );
  }

  if (!qr.active) {
    return (
      <Frame title="Retired QR code">
        This printout has been replaced. Ask an administrator for the current QR code for{" "}
        <strong>{qr.location.name}</strong>.
      </Frame>
    );
  }

  return (
    <div className="max-w-md">
      <div className="rounded-xl border bg-white p-5">
        <div className="text-xs uppercase tracking-wider text-gray-500">
          {qr.location.center.name}
        </div>
        <div className="text-xl font-semibold mt-0.5">{qr.location.name}</div>
        <div className="text-xs text-gray-500 mb-4">
          {qr.location.category.replace(/_/g, " ")}
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Open the inspection screen to start or continue your round, then scan this area from
          inside the app so your position and time are recorded.
        </p>

        <Link
          href="/housekeeping/inspect"
          className="block rounded-lg bg-brand-600 py-3 text-center text-white font-medium"
        >
          Go to inspections
        </Link>
      </div>
    </div>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-md">
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="font-semibold text-amber-900 mb-1">{title}</div>
        <div className="text-sm text-amber-800">{children}</div>
        <Link href="/housekeeping/inspect" className="mt-4 inline-block text-sm text-brand-600 hover:underline">
          ← Inspections
        </Link>
      </div>
    </div>
  );
}

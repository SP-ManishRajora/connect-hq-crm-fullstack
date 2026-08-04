import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { deletePhotoFile } from "@/lib/housekeeping/storage";
import { getRetentionConfig } from "@/lib/housekeeping/settings";

export const runtime = "nodejs";

// POST /api/housekeeping/cron/retention[?dry=1]
//
// Purges photo FILES older than the configured window. Deliberately conservative:
//
//   • Only the bytes are deleted. The row, its hashes, AI findings, scores and the
//     audit trail all survive — history stays intact and reports keep working.
//   • `purgedAt` is stamped so the UI can say "photograph removed under the
//     retention policy" rather than showing a broken image.
//   • `maxDeletesPerRun` caps the blast radius of a misconfigured window.
//   • `dryRun` (config or ?dry=1) reports what WOULD go without touching disk.
//
// Retention is 180 days by default — chosen 2026-08-04, resolving ledger D-02.
async function authorise(req: NextRequest): Promise<{ ok: boolean; actor: string | null }> {
  const secret = process.env.HK_CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (secret && provided && provided === secret) return { ok: true, actor: null };

  const u = await getSessionUser();
  // Purging evidence is an admin-level action even when triggered by hand.
  if (u && requireRole(u.role, ["ADMIN", "OWNER"])) return { ok: true, actor: u.id };
  return { ok: false, actor: null };
}

export async function POST(req: NextRequest) {
  const { ok, actor } = await authorise(req);
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const cfg = await getRetentionConfig();
  const { searchParams } = new URL(req.url);
  const dryRun = cfg.dryRun || searchParams.get("dry") === "1";

  if (cfg.photoRetentionDays <= 0) {
    return NextResponse.json({
      skipped: true,
      reason: "Retention is disabled (photoRetentionDays = 0). Nothing was deleted.",
    });
  }

  const cutoff = new Date(Date.now() - cfg.photoRetentionDays * 86400_000);
  const take = cfg.maxDeletesPerRun;

  // Three photo tables, same treatment.
  const [inspection, generator, request] = await Promise.all([
    prisma.inspectionPhoto.findMany({
      where: { createdAt: { lt: cutoff }, purgedAt: null },
      select: { id: true, filePath: true }, take,
    }),
    prisma.generatorPhoto.findMany({
      where: { createdAt: { lt: cutoff }, purgedAt: null },
      select: { id: true, filePath: true }, take,
    }),
    prisma.cleaningRequestPhoto.findMany({
      where: { createdAt: { lt: cutoff }, purgedAt: null },
      select: { id: true, filePath: true }, take,
    }),
  ]);

  const candidates = inspection.length + generator.length + request.length;

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      cutoff,
      retentionDays: cfg.photoRetentionDays,
      wouldPurge: {
        inspectionPhotos: inspection.length,
        generatorPhotos: generator.length,
        requestPhotos: request.length,
        total: candidates,
      },
    });
  }

  const now = new Date();
  let purged = 0;
  let bytesFreed = 0;
  const failures: string[] = [];

  async function purge(
    rows: { id: string; filePath: string }[],
    stamp: (ids: string[]) => Promise<unknown>,
  ) {
    const done: string[] = [];
    for (const r of rows) {
      try {
        bytesFreed += await deletePhotoFile(r.filePath);
        done.push(r.id);
        purged++;
      } catch (e: any) {
        // One bad path must not abort the whole sweep.
        failures.push(`${r.id}: ${e?.message ?? e}`);
      }
    }
    if (done.length) await stamp(done);
  }

  await purge(inspection, (ids) =>
    prisma.inspectionPhoto.updateMany({ where: { id: { in: ids } }, data: { purgedAt: now } }),
  );
  await purge(generator, (ids) =>
    prisma.generatorPhoto.updateMany({ where: { id: { in: ids } }, data: { purgedAt: now } }),
  );
  await purge(request, (ids) =>
    prisma.cleaningRequestPhoto.updateMany({ where: { id: { in: ids } }, data: { purgedAt: now } }),
  );

  if (purged > 0 || failures.length > 0) {
    await logAction({
      userId: actor,
      action: "HK_PHOTOS_PURGED",
      targetType: "RetentionPolicy",
      meta: {
        retentionDays: cfg.photoRetentionDays,
        cutoff,
        purged,
        bytesFreed,
        failures: failures.length,
        hitCap: candidates >= cfg.maxDeletesPerRun,
      },
    });
  }

  return NextResponse.json({
    dryRun: false,
    cutoff,
    retentionDays: cfg.photoRetentionDays,
    purged,
    mbFreed: Math.round((bytesFreed / 1048576) * 10) / 10,
    failures: failures.length,
    // Tells the operator to run again rather than assuming the backlog is clear.
    moreRemaining: candidates >= cfg.maxDeletesPerRun,
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { ingestGeneratorPhoto, numOrNull } from "@/lib/housekeeping/generator-photo";
import { openRun, evaluateReading, recordFindings } from "@/lib/housekeeping/generator-service";
import { photoReusedFinding } from "@/lib/housekeeping/generator-rules";
import { ocrGeneratorPanel } from "@/lib/ocr";

export const runtime = "nodejs";

// GET — the chronological reading ledger for a generator.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);

    const { searchParams } = new URL(req.url);
    const take = Math.min(Number(searchParams.get("take") || 100), 500);

    const rows = await prisma.generatorReading.findMany({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      take,
      include: {
        user: { select: { id: true, name: true } },
        event: { select: { id: true, type: true } },
      },
    });

    return NextResponse.json(rows);
  } catch (e) {
    return handleError(e);
  }
}

// POST — the mandatory periodic reading while the generator is running
// (brief §11: a new tank/gauge photograph every 30 minutes).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);

    const form = await req.formData();
    const tank = form.get("tankPhoto") as File | null;
    if (!tank) {
      throw Object.assign(new Error("A fuel-tank photograph is required"), { __status: 400 });
    }

    const fuelReading = numOrNull(form.get("fuelReading"));
    const hourMeter = numOrNull(form.get("hourMeter"));
    if (fuelReading == null) {
      throw Object.assign(new Error("The fuel reading is required"), { __status: 400 });
    }

    const run = await openRun(gen.id);
    const findings = [];

    const ingest = await ingestGeneratorPhoto({
      file: tank, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
      kind: "TANK", pHash: form.get("tankPHash") as string | null,
      lat: numOrNull(form.get("lat")), lng: numOrNull(form.get("lng")),
    });
    if (ingest.duplicate) {
      findings.push(photoReusedFinding(`tank photo, first seen ${ingest.duplicate.seenAt.slice(0, 16).replace("T", " ")}`));
    }

    const ocr = await ocrGeneratorPanel(ingest.photoId);
    const prev = await prisma.generatorReading.findFirst({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      select: { id: true, fuelReading: true, hourMeter: true },
    });

    const reading = await prisma.generatorReading.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        userId: u.id,
        kind: run ? "PERIODIC" : "SPOT_CHECK",
        runningAtReading: Boolean(run),
        fuelReading,
        hourMeter,
        ocrFuel: ocr.fuelReading ?? null,
        ocrHourMeter: ocr.hourMeter ?? null,
        ocrConfidence: ocr.confidence,
        ocrRaw: ocr.rawText ?? null,
        photoId: ingest.photoId,
        previousReadingId: prev?.id ?? null,
        fuelDelta: prev?.fuelReading != null ? fuelReading - prev.fuelReading : null,
        hourDelta: prev?.hourMeter != null && hourMeter != null ? hourMeter - prev.hourMeter : null,
        eventId: run?.id ?? null,
      },
    });

    if (findings.length) {
      await recordFindings(gen.id, gen.centerId, findings, { readingId: reading.id, actorId: u.id });
    }
    const auto = await evaluateReading(reading.id, u.id);

    await logAction({
      userId: u.id,
      action: run ? "HK_GENERATOR_PERIODIC_READING" : "HK_GENERATOR_SPOT_READING",
      targetType: "Generator",
      targetId: gen.id,
      meta: {
        readingId: reading.id, fuelReading, hourMeter,
        running: Boolean(run),
        discrepancies: [...findings, ...auto].map((f) => f.ruleCode),
      },
    });

    return NextResponse.json(
      {
        reading,
        discrepancies: [...findings, ...auto].map((f) => ({
          ruleCode: f.ruleCode, severity: f.severity, title: f.title, detail: f.detail,
        })),
      },
      { status: 201 },
    );
  } catch (e) {
    return handleError(e);
  }
}

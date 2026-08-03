import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { ingestGeneratorPhoto, numOrNull } from "@/lib/housekeeping/generator-photo";
import { openRun, evaluateReading, recordFindings, refilledBetween } from "@/lib/housekeeping/generator-service";
import {
  checkBackdated, checkRanButNoHours, checkConsumption, photoReusedFinding,
} from "@/lib/housekeeping/generator-rules";
import { getGeneratorConfig } from "@/lib/housekeeping/settings";
import { ocrGeneratorPanel } from "@/lib/ocr";

export const runtime = "nodejs";

// POST /api/housekeeping/generators/[id]/off  (multipart/form-data)
//   tankPhoto, meterPhoto, fuelReading, hourMeter, atClaimed?, comments?
//
// Closes the run: computes duration, fuel used and litres/hour, then applies the
// end-of-run rules (no hour movement, unusual consumption, backdating, reuse).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);

    const run = await openRun(gen.id);
    if (!run) {
      throw Object.assign(
        new Error("This generator is not currently marked ON"),
        { __status: 409 },
      );
    }

    const form = await req.formData();
    const tank = form.get("tankPhoto") as File | null;
    const meter = form.get("meterPhoto") as File | null;
    if (!tank || !meter) {
      throw Object.assign(
        new Error("Both a final tank photograph and a final meter photograph are required"),
        { __status: 400 },
      );
    }

    const fuelReading = numOrNull(form.get("fuelReading"));
    const hourMeter = numOrNull(form.get("hourMeter"));
    if (fuelReading == null || hourMeter == null) {
      throw Object.assign(
        new Error("Both the closing fuel reading and hour-meter reading are required"),
        { __status: 400 },
      );
    }

    const cfg = await getGeneratorConfig();
    const findings = [];

    const tankIngest = await ingestGeneratorPhoto({
      file: tank, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
      kind: "TANK", pHash: form.get("tankPHash") as string | null,
    });
    const meterIngest = await ingestGeneratorPhoto({
      file: meter, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
      kind: "METER", pHash: form.get("meterPHash") as string | null,
    });
    if (tankIngest.duplicate) findings.push(photoReusedFinding(`tank photo, first seen ${tankIngest.duplicate.seenAt.slice(0, 16).replace("T", " ")}`));
    if (meterIngest.duplicate) findings.push(photoReusedFinding(`meter photo, first seen ${meterIngest.duplicate.seenAt.slice(0, 16).replace("T", " ")}`));

    const claimedRaw = String(form.get("atClaimed") || "");
    const atClaimed = claimedRaw ? new Date(claimedRaw) : null;
    const validClaimed = atClaimed && !Number.isNaN(atClaimed.getTime()) ? atClaimed : null;
    const serverNow = new Date();
    const backdate = checkBackdated(validClaimed, serverNow, cfg);
    if (backdate) findings.push(backdate);

    // --- close out the run --------------------------------------------------
    const startReading = await prisma.generatorReading.findFirst({
      where: { generatorId: gen.id, eventId: run.id, kind: "START" },
      orderBy: { at: "asc" },
    });

    const runMinutes = (serverNow.getTime() - run.atServer.getTime()) / 60_000;
    const runHours = runMinutes / 60;

    // Fuel consumed must account for any diesel added mid-run.
    const refill = await refilledBetween(gen.id, run.atServer, serverNow);
    let fuelUsedL: number | null = null;
    let litresPerHour: number | null = null;
    if (startReading?.fuelReading != null) {
      fuelUsedL = startReading.fuelReading + refill.litres - fuelReading;
      if (runHours > 0.05 && fuelUsedL >= 0) {
        litresPerHour = fuelUsedL / runHours;
      }
    }

    // Rule 4 — ran but the hour-meter never moved.
    const noHours = checkRanButNoHours(startReading?.hourMeter ?? null, hourMeter, runMinutes, cfg);
    if (noHours) findings.push(noHours);

    // Rule 8 — consumption above the normal range.
    if (litresPerHour != null) {
      const high = checkConsumption(litresPerHour, gen, cfg);
      if (high) findings.push(high);
    }

    const event = await prisma.generatorEvent.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        type: "OFF",
        atClaimed: validClaimed,
        userId: u.id,
        comments: (form.get("comments") as string) || null,
        runMinutes: Math.round(runMinutes * 100) / 100,
        fuelUsedL: fuelUsedL != null ? Math.round(fuelUsedL * 100) / 100 : null,
        litresPerHour: litresPerHour != null ? Math.round(litresPerHour * 100) / 100 : null,
      },
    });

    const ocr = await ocrGeneratorPanel(meterIngest.photoId);
    const prevReading = await prisma.generatorReading.findFirst({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      select: { id: true, fuelReading: true, hourMeter: true },
    });

    const reading = await prisma.generatorReading.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        userId: u.id,
        kind: "STOP",
        runningAtReading: false,
        fuelReading,
        hourMeter,
        ocrFuel: ocr.fuelReading ?? null,
        ocrHourMeter: ocr.hourMeter ?? null,
        ocrConfidence: ocr.confidence,
        ocrRaw: ocr.rawText ?? null,
        photoId: tankIngest.photoId,
        previousReadingId: prevReading?.id ?? null,
        fuelDelta: prevReading?.fuelReading != null ? fuelReading - prevReading.fuelReading : null,
        hourDelta: prevReading?.hourMeter != null ? hourMeter - prevReading.hourMeter : null,
        eventId: event.id,
      },
    });

    if (findings.length) {
      await recordFindings(gen.id, gen.centerId, findings, {
        readingId: reading.id, eventId: event.id, actorId: u.id,
      });
    }
    const auto = await evaluateReading(reading.id, u.id);

    await logAction({
      userId: u.id,
      action: "HK_GENERATOR_OFF",
      targetType: "Generator",
      targetId: gen.id,
      meta: {
        eventId: event.id, readingId: reading.id,
        runMinutes: event.runMinutes, fuelUsedL: event.fuelUsedL,
        litresPerHour: event.litresPerHour, refilledDuringRun: refill.litres,
        discrepancies: [...findings, ...auto].map((f) => f.ruleCode),
      },
    });

    return NextResponse.json({
      event,
      reading,
      summary: {
        runMinutes: event.runMinutes,
        runHours: Math.round(runHours * 100) / 100,
        fuelUsedL: event.fuelUsedL,
        litresPerHour: event.litresPerHour,
        refilledDuringRun: refill.litres,
      },
      discrepancies: [...findings, ...auto].map((f) => ({
        ruleCode: f.ruleCode, severity: f.severity, title: f.title, detail: f.detail,
      })),
    });
  } catch (e) {
    return handleError(e);
  }
}

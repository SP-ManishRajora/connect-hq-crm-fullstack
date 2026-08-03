import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { ingestGeneratorPhoto, numOrNull } from "@/lib/housekeeping/generator-photo";
import { openRun, evaluateReading, recordFindings } from "@/lib/housekeeping/generator-service";
import { checkBackdated, photoReusedFinding } from "@/lib/housekeeping/generator-rules";
import { getGeneratorConfig } from "@/lib/housekeeping/settings";
import { ocrGeneratorPanel } from "@/lib/ocr";

export const runtime = "nodejs";

// POST /api/housekeeping/generators/[id]/on  (multipart/form-data)
//   panelPhoto, tankPhoto, fuelReading, hourMeter, reason?, loadReading?,
//   atClaimed?, panelPHash?, tankPHash?
//
// Server time is authoritative: `atServer` defaults to now() in the database.
// A claimed time is stored separately and, if it differs beyond tolerance,
// raises the backdating rule rather than moving the recorded time.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({
      where: { id: params.id, deletedAt: null },
    });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);
    if (!gen.active) {
      throw Object.assign(new Error("This generator is not in service"), { __status: 409 });
    }

    const already = await openRun(gen.id);
    if (already) {
      throw Object.assign(
        new Error(`This generator is already marked ON (since ${already.atServer.toISOString().slice(0, 16).replace("T", " ")}). Switch it OFF first.`),
        { __status: 409 },
      );
    }

    const form = await req.formData();
    const panel = form.get("panelPhoto") as File | null;
    const tank = form.get("tankPhoto") as File | null;

    // Brief §11: a live panel photograph AND a tank/gauge photograph are both
    // mandatory whenever the generator is switched on.
    if (!panel || !tank) {
      throw Object.assign(
        new Error("Both a control-panel photograph and a fuel-tank photograph are required"),
        { __status: 400 },
      );
    }

    const fuelReading = numOrNull(form.get("fuelReading"));
    const hourMeter = numOrNull(form.get("hourMeter"));
    if (fuelReading == null || hourMeter == null) {
      throw Object.assign(
        new Error("Both the fuel reading and the hour-meter reading are required"),
        { __status: 400 },
      );
    }

    const cfg = await getGeneratorConfig();
    const findings = [];

    const panelIngest = await ingestGeneratorPhoto({
      file: panel, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
      kind: "PANEL", pHash: form.get("panelPHash") as string | null,
      lat: numOrNull(form.get("lat")), lng: numOrNull(form.get("lng")),
    });
    const tankIngest = await ingestGeneratorPhoto({
      file: tank, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
      kind: "TANK", pHash: form.get("tankPHash") as string | null,
      lat: numOrNull(form.get("lat")), lng: numOrNull(form.get("lng")),
    });

    // Rule 9 — reused photograph.
    if (panelIngest.duplicate) findings.push(photoReusedFinding(`panel photo, first seen ${panelIngest.duplicate.seenAt.slice(0, 16).replace("T", " ")}`));
    if (tankIngest.duplicate) findings.push(photoReusedFinding(`tank photo, first seen ${tankIngest.duplicate.seenAt.slice(0, 16).replace("T", " ")}`));

    // Rule 10 — backdating.
    const claimedRaw = String(form.get("atClaimed") || "");
    const atClaimed = claimedRaw ? new Date(claimedRaw) : null;
    const validClaimed = atClaimed && !Number.isNaN(atClaimed.getTime()) ? atClaimed : null;
    const serverNow = new Date();
    const backdate = checkBackdated(validClaimed, serverNow, cfg);
    if (backdate) findings.push(backdate);

    // OCR the panel — advisory only; the operator's typed values are stored as
    // authoritative and the two are compared by rule 6.
    const ocr = await ocrGeneratorPanel(panelIngest.photoId);

    const prevReading = await prisma.generatorReading.findFirst({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      select: { id: true, fuelReading: true, hourMeter: true },
    });

    const event = await prisma.generatorEvent.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        type: "ON",
        atClaimed: validClaimed,
        userId: u.id,
        reason: (form.get("reason") as string) || null,
        loadReading: numOrNull(form.get("loadReading")),
        comments: (form.get("comments") as string) || null,
      },
    });

    const reading = await prisma.generatorReading.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        userId: u.id,
        kind: "START",
        runningAtReading: true,
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
    // Delta rules (fuel moved / hours moved without a run) against the previous reading.
    const auto = await evaluateReading(reading.id, u.id);

    await logAction({
      userId: u.id,
      action: "HK_GENERATOR_ON",
      targetType: "Generator",
      targetId: gen.id,
      meta: {
        eventId: event.id, readingId: reading.id,
        fuelReading, hourMeter,
        atServer: event.atServer, atClaimed: validClaimed,
        discrepancies: [...findings, ...auto].map((f) => f.ruleCode),
      },
    });

    return NextResponse.json(
      {
        event, reading,
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, parseBody, handleError, centerScope, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { openRun } from "@/lib/housekeeping/generator-service";

const createSchema = z.object({
  centerId: z.string().min(1),
  name: z.string().min(1).max(120),
  code: z.string().min(1).max(40),
  tankCapacityL: z.number().positive().max(100000).nullish(),
  normalLphMin: z.number().min(0).max(1000).nullish(),
  normalLphMax: z.number().min(0).max(1000).nullish(),
  photoIntervalMin: z.number().int().min(5).max(240).default(30),
  graceMin: z.number().int().min(0).max(120).default(10),
  maxRunHours: z.number().min(0.5).max(168).default(12),
});

// GET /api/housekeeping/generators?centerId=
export async function GET(req: NextRequest) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const { searchParams } = new URL(req.url);
    const centerId = searchParams.get("centerId") || undefined;
    if (centerId) assertCenterAllowed(u, centerId);
    const scope = centerScope(u);

    const rows = await prisma.generator.findMany({
      where: {
        deletedAt: null,
        ...(centerId ? { centerId } : scope ? { centerId: scope } : {}),
      },
      orderBy: [{ centerId: "asc" }, { name: "asc" }],
      include: {
        center: { select: { id: true, name: true } },
        _count: { select: { discrepancies: { where: { resolvedAt: null } } } },
      },
    });

    // Annotate live running state + last reading so the UI needs one call.
    const withState = await Promise.all(
      rows.map(async (g) => {
        const run = await openRun(g.id);
        const lastReading = await prisma.generatorReading.findFirst({
          where: { generatorId: g.id },
          orderBy: { at: "desc" },
          select: { at: true, fuelReading: true, hourMeter: true },
        });
        return {
          ...g,
          running: Boolean(run),
          runningSince: run?.atServer ?? null,
          lastReading,
        };
      }),
    );

    return NextResponse.json(withState);
  } catch (e) {
    return handleError(e);
  }
}

// POST /api/housekeeping/generators
export async function POST(req: NextRequest) {
  const u = await requireModule("hk_admin");
  if (isResponse(u)) return u;

  try {
    const b = parseBody(createSchema, await req.json());
    assertCenterAllowed(u, b.centerId);

    if (b.normalLphMin != null && b.normalLphMax != null && b.normalLphMin > b.normalLphMax) {
      throw Object.assign(
        new Error("Minimum consumption cannot exceed the maximum"),
        { __status: 400 },
      );
    }

    const dup = await prisma.generator.findFirst({
      where: { centerId: b.centerId, code: b.code, deletedAt: null },
    });
    if (dup) {
      throw Object.assign(
        new Error(`A generator with code "${b.code}" already exists at this centre`),
        { __status: 409 },
      );
    }

    const row = await prisma.generator.create({
      data: {
        centerId: b.centerId,
        name: b.name,
        code: b.code,
        tankCapacityL: b.tankCapacityL ?? null,
        normalLphMin: b.normalLphMin ?? null,
        normalLphMax: b.normalLphMax ?? null,
        photoIntervalMin: b.photoIntervalMin,
        graceMin: b.graceMin,
        maxRunHours: b.maxRunHours,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_GENERATOR_CREATED",
      targetType: "Generator",
      targetId: row.id,
      meta: { name: row.name, code: row.code, centerId: row.centerId },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

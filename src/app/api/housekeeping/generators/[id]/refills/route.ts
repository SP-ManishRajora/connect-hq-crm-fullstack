import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  requireModule, isResponse, handleError, assertCenterAllowed,
} from "@/lib/housekeeping/route-helpers";
import { ingestGeneratorPhoto, numOrNull } from "@/lib/housekeeping/generator-photo";

export const runtime = "nodejs";

// GET — refill history + a simple consumption trend.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);

    const refills = await prisma.generatorRefill.findMany({
      where: { generatorId: gen.id },
      orderBy: { at: "desc" },
      take: 100,
      include: { user: { select: { id: true, name: true } } },
    });

    // Consumption trend from closed runs.
    const runs = await prisma.generatorEvent.findMany({
      where: { generatorId: gen.id, type: "OFF", litresPerHour: { not: null } },
      orderBy: { atServer: "desc" },
      take: 30,
      select: { atServer: true, litresPerHour: true, runMinutes: true, fuelUsedL: true },
    });

    const totalLitres = refills.reduce((s, r) => s + r.litres, 0);
    const totalCost = refills.reduce((s, r) => s + (r.totalCost ?? 0), 0);
    const avgLph = runs.length
      ? runs.reduce((s, r) => s + (r.litresPerHour ?? 0), 0) / runs.length
      : null;

    return NextResponse.json({
      refills,
      trend: runs.reverse(),
      totals: {
        litres: Math.round(totalLitres * 100) / 100,
        cost: Math.round(totalCost * 100) / 100,
        avgLitresPerHour: avgLph != null ? Math.round(avgLph * 100) / 100 : null,
      },
    });
  } catch (e) {
    return handleError(e);
  }
}

// POST — log a diesel refill. Recording it is what stops the "fuel increased
// with no refill entry" rule from firing on the next reading.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await requireModule("hk_generator");
  if (isResponse(u)) return u;

  try {
    const gen = await prisma.generator.findFirst({ where: { id: params.id, deletedAt: null } });
    if (!gen) throw Object.assign(new Error("Generator not found"), { __status: 404 });
    assertCenterAllowed(u, gen.centerId);

    const form = await req.formData();
    const litres = numOrNull(form.get("litres"));
    if (litres == null || litres <= 0) {
      throw Object.assign(new Error("Litres added is required"), { __status: 400 });
    }
    if (gen.tankCapacityL && litres > gen.tankCapacityL * 1.05) {
      throw Object.assign(
        new Error(`${litres} L exceeds the tank capacity of ${gen.tankCapacityL} L`),
        { __status: 400 },
      );
    }

    const file = form.get("photo") as File | null;
    let photoId: string | null = null;
    if (file) {
      const ing = await ingestGeneratorPhoto({
        file, generatorId: gen.id, centerId: gen.centerId, userId: u.id,
        kind: "REFILL", pHash: form.get("pHash") as string | null,
      });
      photoId = ing.photoId;
    }

    const costPerL = numOrNull(form.get("costPerL"));
    const row = await prisma.generatorRefill.create({
      data: {
        generatorId: gen.id,
        centerId: gen.centerId,
        userId: u.id,
        litres,
        costPerL,
        totalCost: costPerL != null ? Math.round(costPerL * litres * 100) / 100 : numOrNull(form.get("totalCost")),
        vendor: (form.get("vendor") as string) || null,
        invoiceRef: (form.get("invoiceRef") as string) || null,
        fuelBefore: numOrNull(form.get("fuelBefore")),
        fuelAfter: numOrNull(form.get("fuelAfter")),
        notes: (form.get("notes") as string) || null,
        photoId,
      },
    });

    await logAction({
      userId: u.id,
      action: "HK_GENERATOR_REFILL",
      targetType: "Generator",
      targetId: gen.id,
      meta: {
        refillId: row.id, litres, totalCost: row.totalCost,
        vendor: row.vendor, invoiceRef: row.invoiceRef,
      },
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleError(e);
  }
}

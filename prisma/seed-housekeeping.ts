// Seeds inspection locations + QR codes for every active centre.
//
// The brief lists "8 bathrooms, 5 common areas, parking, back, front, guard
// room, electricity room, generator area, fuel tank" — those quantities live
// HERE as seed data, never hard-coded in application code. Admins add, rename,
// reorder and remove locations freely afterwards.
//
// Idempotent: re-running skips locations that already exist (matched on
// centre + name) and only mints a QR for locations that lack an active one.
//
//   npx tsx prisma/seed-housekeeping.ts

import { PrismaClient, HkLocationCategory } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

type Spec = {
  name: string;
  category: HkLocationCategory;
  minDwellSeconds?: number;
  priority?: string;
};

function buildSpecs(): Spec[] {
  const specs: Spec[] = [];

  for (let i = 1; i <= 8; i++) {
    specs.push({ name: `Bathroom ${i}`, category: "BATHROOM", minDwellSeconds: 90 });
  }
  for (let i = 1; i <= 5; i++) {
    specs.push({ name: `Common Area ${i}`, category: "COMMON_AREA", minDwellSeconds: 60 });
  }

  specs.push(
    { name: "Parking Area", category: "PARKING", minDwellSeconds: 60 },
    { name: "Front Area", category: "FRONT_AREA", minDwellSeconds: 45 },
    { name: "Back Area", category: "BACK_AREA", minDwellSeconds: 45 },
    { name: "Guard Room", category: "GUARD_ROOM", minDwellSeconds: 45 },
    { name: "Electricity Room", category: "ELECTRICITY_ROOM", minDwellSeconds: 60, priority: "HIGH" },
    { name: "Generator Area", category: "GENERATOR_AREA", minDwellSeconds: 60, priority: "HIGH" },
    { name: "Generator Fuel Tank", category: "FUEL_TANK", minDwellSeconds: 60, priority: "CRITICAL" },
  );

  return specs;
}

// Opaque, unguessable code. Carries no centre/area information — the QR
// identifies the location only via a server-side lookup.
function newQrCode(): string {
  return randomBytes(12).toString("base64url"); // 16 chars
}

async function main() {
  const centers = await prisma.center.findMany({ where: { active: true } });
  if (centers.length === 0) {
    console.log("No active centres found — create a centre first, then re-run.");
    return;
  }

  const specs = buildSpecs();
  let created = 0;
  let skipped = 0;
  let qrsMinted = 0;

  for (const center of centers) {
    console.log(`\n📍 ${center.name} (${center.city})`);

    for (const [idx, spec] of specs.entries()) {
      const existing = await prisma.inspectionLocation.findFirst({
        where: { centerId: center.id, name: spec.name, deletedAt: null },
      });

      const location =
        existing ??
        (await prisma.inspectionLocation.create({
          data: {
            centerId: center.id,
            name: spec.name,
            category: spec.category,
            sortOrder: idx,
            minDwellSeconds: spec.minDwellSeconds ?? 60,
            priority: spec.priority ?? "NORMAL",
            requiredPhotoCount: 4,
            // requiredAngles left null → the app falls back to the
            // category-appropriate defaults in lib/housekeeping/types.ts
          },
        }));

      if (existing) skipped++;
      else created++;

      const hasQr = await prisma.locationQrCode.findFirst({
        where: { locationId: location.id, active: true },
      });
      if (!hasQr) {
        await prisma.locationQrCode.create({
          data: { locationId: location.id, code: newQrCode(), version: 1 },
        });
        qrsMinted++;
      }
    }
  }

  console.log(
    `\n✅ Locations created: ${created}, already present: ${skipped}, QR codes minted: ${qrsMinted}`,
  );
  console.log("   Print them from  /housekeeping/setup/qr-sheet");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

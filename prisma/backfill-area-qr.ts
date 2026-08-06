import { randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// One sticker per area, so every active area needs BOTH an active LocationQrCode
// and an active ClientQrCode behind it. Areas created before the unified sticker
// generally have only the staff half (client codes existed solely via
// `db:seed:cr`), which would leave a printed label that works for staff and
// dead-ends for members.
//
// Idempotent: only mints the halves that are missing. Never rotates or deactivates
// an existing code, so running it twice cannot invalidate a printout already on a
// wall. Run after deploying the unified-QR change, then reprint any area it
// reports as changed.
function newCode(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  const locations = await prisma.inspectionLocation.findMany({
    where: { deletedAt: null, active: true },
    select: {
      id: true,
      name: true,
      center: { select: { name: true } },
      qrCodes: { where: { active: true }, select: { id: true }, take: 1 },
      clientQrCodes: { where: { active: true }, select: { id: true }, take: 1 },
    },
    orderBy: [{ centerId: "asc" }, { sortOrder: "asc" }],
  });

  let staffMinted = 0;
  let clientMinted = 0;
  const touched: string[] = [];

  for (const l of locations) {
    const needsStaff = l.qrCodes.length === 0;
    const needsClient = l.clientQrCodes.length === 0;
    if (!needsStaff && !needsClient) continue;

    if (needsStaff) {
      await prisma.locationQrCode.create({ data: { locationId: l.id, code: newCode() } });
      staffMinted++;
    }
    if (needsClient) {
      await prisma.clientQrCode.create({ data: { locationId: l.id, code: newCode() } });
      clientMinted++;
    }
    touched.push(`${l.center.name} — ${l.name}`);
  }

  console.log(`Areas checked: ${locations.length}`);
  console.log(`Staff codes minted: ${staffMinted}`);
  console.log(`Client codes minted: ${clientMinted}`);

  if (touched.length) {
    console.log(`\nReprint the area sticker for these ${touched.length}:`);
    for (const t of touched) console.log(`  · ${t}`);
    console.log("\n  /housekeeping/setup/client-qr-sheet?centerId=<id>");
  } else {
    console.log("\nEvery active area already has both halves — nothing to reprint.");
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

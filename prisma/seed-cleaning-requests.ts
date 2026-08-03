// Seeds the client-facing request catalogue (brief §24) and a CLIENT QR code
// for every inspection area.
//
// The 16 services and 8 consumables live HERE as data — admins add, rename and
// deactivate them freely afterwards. SLA targets follow brief §32.
//
// Client QR codes are deliberately SEPARATE from the staff LocationQrCode, so a
// client sticker and a staff sticker can never be confused.
//
//   npx tsx prisma/seed-cleaning-requests.ts

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

type Spec = {
  name: string;
  slug: string;
  group: "CLEANING" | "CONSUMABLE" | "REPORT";
  slaMinutes: number;
  autoUrgent?: boolean;
  requiresPhotos?: number;
};

// SLA targets per brief §32; anything not listed there gets a sensible default.
const TYPES: Spec[] = [
  // --- 16 cleaning services ---
  { name: "Spill cleaning",          slug: "spill",            group: "CLEANING", slaMinutes: 5,  autoUrgent: true },
  { name: "Bathroom cleaning",       slug: "bathroom",         group: "CLEANING", slaMinutes: 10, requiresPhotos: 2 },
  { name: "Dustbin clearance",       slug: "dustbin",          group: "CLEANING", slaMinutes: 10 },
  { name: "Urgent cleaning",         slug: "urgent",           group: "CLEANING", slaMinutes: 10, autoUrgent: true },
  { name: "Meeting-room cleaning",   slug: "meeting-room",     group: "CLEANING", slaMinutes: 15 },
  { name: "Table cleaning",          slug: "table",            group: "CLEANING", slaMinutes: 15 },
  { name: "Glass or mirror cleaning",slug: "glass",            group: "CLEANING", slaMinutes: 20 },
  { name: "Cabin cleaning",          slug: "cabin",            group: "CLEANING", slaMinutes: 20 },
  { name: "Common-area cleaning",    slug: "common-area",      group: "CLEANING", slaMinutes: 20 },
  { name: "Floor cleaning",          slug: "floor",            group: "CLEANING", slaMinutes: 20 },
  { name: "Pantry cleaning",         slug: "pantry",           group: "CLEANING", slaMinutes: 20 },
  { name: "Sofa or chair cleaning",  slug: "sofa",             group: "CLEANING", slaMinutes: 25 },
  { name: "Sanitisation",            slug: "sanitisation",     group: "CLEANING", slaMinutes: 25 },
  { name: "Parking-area cleaning",   slug: "parking",          group: "CLEANING", slaMinutes: 30 },
  { name: "Consumable replenishment",slug: "consumable-refill",group: "CLEANING", slaMinutes: 10 },
  { name: "Other cleaning assistance", slug: "other",          group: "CLEANING", slaMinutes: 20 },

  // --- 8 consumables ---
  { name: "Handwash",       slug: "c-handwash",     group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Toilet paper",   slug: "c-toilet-paper", group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Tissue paper",   slug: "c-tissue",       group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Sanitiser",      slug: "c-sanitiser",    group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Dustbin liner",  slug: "c-bin-liner",    group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Drinking water", slug: "c-water",        group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Paper cups",     slug: "c-cups",         group: "CONSUMABLE", slaMinutes: 10 },
  { name: "Other consumable", slug: "c-other",      group: "CONSUMABLE", slaMinutes: 15 },

  // --- report / feedback actions (brief §35) ---
  { name: "Report cleanliness problem",  slug: "r-cleanliness", group: "REPORT", slaMinutes: 15 },
  { name: "Report maintenance problem",  slug: "r-maintenance", group: "REPORT", slaMinutes: 30 },
  { name: "Report safety issue",         slug: "r-safety",      group: "REPORT", slaMinutes: 5, autoUrgent: true },
  { name: "Give feedback",               slug: "r-feedback",    group: "REPORT", slaMinutes: 120 },
];

function newCode(): string {
  return randomBytes(12).toString("base64url");
}

async function main() {
  let created = 0, updated = 0;

  for (const [i, t] of TYPES.entries()) {
    const existing = await prisma.cleaningRequestType.findUnique({ where: { slug: t.slug } });
    if (existing) {
      // Keep admin edits to name/active; only refresh ordering.
      await prisma.cleaningRequestType.update({
        where: { slug: t.slug }, data: { sortOrder: i },
      });
      updated++;
    } else {
      await prisma.cleaningRequestType.create({
        data: {
          name: t.name, slug: t.slug, group: t.group,
          slaMinutes: t.slaMinutes, autoUrgent: t.autoUrgent ?? false,
          requiresPhotos: t.requiresPhotos ?? 1, sortOrder: i,
        },
      });
      created++;
    }
  }
  console.log(`Request types — created: ${created}, already present: ${updated}`);

  // A client QR per active inspection area.
  const locations = await prisma.inspectionLocation.findMany({
    where: { deletedAt: null, active: true },
    select: { id: true, name: true, center: { select: { name: true } } },
  });

  let qrs = 0;
  for (const l of locations) {
    const has = await prisma.clientQrCode.findFirst({
      where: { locationId: l.id, active: true },
    });
    if (!has) {
      await prisma.clientQrCode.create({ data: { locationId: l.id, code: newCode() } });
      qrs++;
    }
  }
  console.log(`Client QR codes minted: ${qrs} (for ${locations.length} areas)`);
  console.log("Print them from  /housekeeping/setup/client-qr-sheet");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

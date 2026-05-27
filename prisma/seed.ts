import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding...");

  // Centers
  const c1 = await prisma.center.create({ data: { name: "CW Connaught Place", city: "Delhi", address: "Block-F, CP, Delhi", totalSeats: 80 } });
  const c2 = await prisma.center.create({ data: { name: "CW Cyber Hub", city: "Gurgaon", address: "Cyber Hub, Gurgaon", totalSeats: 120 } });

  // Seats
  for (const c of [c1, c2]) {
    for (let i = 1; i <= c.totalSeats; i++) {
      await prisma.seat.create({ data: { centerId: c.id, number: `S${i}`, occupied: i % 4 === 0 } });
    }
  }

  // Users
  const mkUser = async (email: string, name: string, role: string, password: string, centerId?: string) =>
    prisma.user.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 10), centerId: centerId || null } });

  await mkUser("admin@erp.com", "Admin", "ADMIN", "admin123");
  await mkUser("owner@erp.com", "Owner", "OWNER", "owner123");
  await mkUser("manager@erp.com", "Manager", "MANAGER", "manager123");
  await mkUser("sales@erp.com", "Sales User", "SALES", "sales123");
  await mkUser("ops@erp.com", "Operations", "OPS", "ops123");
  await mkUser("cm@erp.com", "Center Manager", "CENTER_MANAGER", "cm123", c1.id);
  await mkUser("accounts@erp.com", "Accounts", "ACCOUNTS", "accounts123");
  await mkUser("it@erp.com", "IT Admin", "IT", "it123");
  await mkUser("client@erp.com", "Acme Pvt Ltd", "CLIENT", "client123");

  // Repair categories (predefined)
  for (const name of ["BATHROOM_REPAIR", "LIGHT_REPAIR", "AC_REPAIR", "CHAIR_REPAIR", "PLUMBING", "DOOR_LOCK"]) {
    await prisma.repairCategory.create({ data: { name } });
  }

  // Vendors
  const vTea = await prisma.vendor.create({ data: { name: "Brewista Tea & Coffee", category: "TEA_COFFEE", contact: "Ravi", email: "ravi@brewista.in", phone: "9999100001", gstin: "07AABCU9603R1ZJ", panNumber: "AABCU9603R" } });
  const vClean = await prisma.vendor.create({ data: { name: "ShineMax Housekeeping", category: "HOUSEKEEPING", contact: "Suman", email: "ops@shinemax.in", phone: "9999100002" } });
  const vNet = await prisma.vendor.create({ data: { name: "Airtel Business", category: "INTERNET", contact: "AccMgr", email: "ent@airtel.in", phone: "9999100003" } });

  // Sample leads
  const leads = await Promise.all([
    prisma.lead.create({ data: { source: "WEB_FORM", name: "Rahul Khanna", email: "rahul@startup.io", phone: "9000011111", company: "Startup IO", seatsNeeded: 8, budget: 90000, centerId: c2.id, status: "NEW" } }),
    prisma.lead.create({ data: { source: "CALL", name: "Anita Desai", email: "anita@bizz.in", phone: "9000022222", company: "Bizz Tech", seatsNeeded: 4, budget: 40000, centerId: c1.id, status: "CONTACTED" } }),
    prisma.lead.create({ data: { source: "WHATSAPP", name: "Karan Mehta", phone: "9000033333", company: "Solo CA", seatsNeeded: 1, status: "TOUR_SCHEDULED", centerId: c1.id } }),
  ]);
  await prisma.comment.create({ data: { leadId: leads[2].id, body: "Whatsapp: 'Can I see the place tomorrow?'", channel: "WHATSAPP" } });

  // Visitor with KYC
  await prisma.visitor.create({ data: { name: "Anita Desai", phone: "9000022222", email: "anita@bizz.in", aadhaar: "1234-5678-9012", pan: "ABCDE1234F", leadId: leads[1].id, centerId: c1.id, tourTaken: true, tourDate: new Date(), kycVerified: true, digilockerRef: "DEMO-1" } });

  // Sample inventory
  await prisma.inventoryItem.createMany({ data: [
    { centerId: c1.id, name: "Tea bags", category: "TEA_COFFEE", unit: "pkts", currentStock: 15, threshold: 5 },
    { centerId: c1.id, name: "Coffee powder", category: "TEA_COFFEE", unit: "kg", currentStock: 4, threshold: 2 },
    { centerId: c1.id, name: "Toilet rolls", category: "HOUSEKEEPING", unit: "rolls", currentStock: 3, threshold: 6 },
    { centerId: c2.id, name: "Tea bags", category: "TEA_COFFEE", unit: "pkts", currentStock: 22, threshold: 5 },
  ]});

  // Sample assets
  await prisma.asset.createMany({ data: [
    { centerId: c1.id, name: "Aristo Chair", category: "CHAIR", serialNo: "CH-001", location: "Zone A", cost: 8500, status: "OK" },
    { centerId: c1.id, name: "Daikin AC 1.5T", category: "AC", serialNo: "AC-001", location: "Cabin 1", cost: 45000, status: "OK" },
    { centerId: c2.id, name: "Cisco Switch", category: "NETWORK_EQUIPMENT", serialNo: "NS-001", location: "Server Room", cost: 35000, status: "OK" },
  ]});

  // Recurring POs
  await prisma.purchaseOrder.create({ data: {
    vendorId: vTea.id, centerId: c1.id, issuedById: (await prisma.user.findUniqueOrThrow({ where: { email: "ops@erp.com" } })).id,
    itemsJson: JSON.stringify([{ item: "Tea bags pkt", qty: 30, rate: 120 }, { item: "Coffee powder kg", qty: 5, rate: 800 }]),
    totalAmount: 30 * 120 + 5 * 800, isRecurring: true, recurrence: "MONTHLY", category: "TEA_COFFEE",
  } });
  await prisma.purchaseOrder.create({ data: {
    vendorId: vNet.id, centerId: c1.id, issuedById: (await prisma.user.findUniqueOrThrow({ where: { email: "ops@erp.com" } })).id,
    itemsJson: JSON.stringify([{ item: "100Mbps Fiber", qty: 1, rate: 12000 }]),
    totalAmount: 12000, isRecurring: true, recurrence: "MONTHLY", category: "INTERNET",
  } });

  // Meeting rooms
  await prisma.meetingRoom.createMany({ data: [
    { centerId: c1.id, name: "Pluto Boardroom", capacity: 10, hourlyRate: 800 },
    { centerId: c1.id, name: "Mars Huddle", capacity: 4, hourlyRate: 300 },
    { centerId: c2.id, name: "Saturn Room", capacity: 8, hourlyRate: 700 },
  ]});

  // SOPs
  await prisma.sop.createMany({ data: [
    { title: "Client Onboarding Kit", category: "ONBOARDING", body: "1. Welcome email\n2. Center tour\n3. Wi-Fi credentials\n4. Access card\n5. Add to WhatsApp group\n6. Two-way confirmation form" },
    { title: "Daily Cleanliness Check", category: "OPS", body: "Inspect washrooms, kitchenette, lounge. Photo evidence to be uploaded daily by 10AM." },
    { title: "Vendor Onboarding", category: "OPS", body: "Collect GSTIN, PAN, bank details, rate card. KYC verify. Add to vendor master." },
    { title: "Internet Outage Response", category: "IT", body: "1. Confirm scope\n2. Reboot router\n3. Call ISP escalation\n4. Notify clients via app" },
  ]});

  // Notices
  await prisma.notice.createMany({ data: [
    { title: "Pongal Celebration on 15 Jan", body: "Snacks at the lounge from 4PM. RSVP at reception.", centerId: c1.id },
    { title: "Brand Tie-up: 20% off at Cafe Mocha", body: "Show your CW pass.", isAd: true, brand: "Cafe Mocha" },
  ]});

  console.log("✅ Seed complete");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const u = await getSessionUser();
  if (!u) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const c = await prisma.client.update({
    where: { id: params.id },
    data: { sentToOps: true },
    include: { center: true },
  });
  // Notify ops + CMs of the center
  const ops = await prisma.user.findMany({
    where: {
      OR: [{ role: "OPS" }, { role: "CENTER_MANAGER", centerId: c.centerId }],
    },
  });
  for (const o of ops) {
    await sendMail(o.email, `New onboarding handover: ${c.companyName}`, `New client onboarding for center ${c.center.name}.\nSpecial: ${c.specialAgreement || "—"}\nStart: ${c.startDate}`);
  }
  // Onboarding kit SOP alert
  await sendMail("ops@erp.com", `[SOP] Trigger client onboarding kit for ${c.companyName}`, `Please trigger the standard client onboarding kit SOP for client ${c.companyName} at ${c.center.name}.`);
  return NextResponse.json(c);
}

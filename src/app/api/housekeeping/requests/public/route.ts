import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logAction } from "@/lib/audit";
import {
  rateLimit, clientIp, sameOriginOrSecret, cap,
} from "@/lib/housekeeping/rate-limit";
import {
  nextTicketNo, newStatusToken, detectUrgency, dueFrom, pickAssignee,
} from "@/lib/housekeeping/requests";
import { getRequestConfig } from "@/lib/housekeeping/settings";
import { raiseAlert, buildAlertBody, appUrl, ALERT_TYPES } from "@/lib/housekeeping/alerts";

export const runtime = "nodejs";

// PUBLIC, UNAUTHENTICATED. Anyone who can scan a printed QR can post here, so
// every field is treated as hostile:
//   • rate limited per IP and per QR code
//   • optional shared secret / same-origin check (HK_PUBLIC_SECRET)
//   • all free text length-capped
//   • the QR code is the ONLY way to name a centre/area — a caller cannot pick one
//   • client company must exist at that centre; an arbitrary id is rejected
const RATE_LIMIT_PER_IP = 8;
const RATE_LIMIT_PER_CODE = 15;
const WINDOW_MS = 10 * 60 * 1000;

export async function POST(req: NextRequest) {
  if (!sameOriginOrSecret(req, "HK_PUBLIC_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = clientIp(req);
  const ipLimit = rateLimit(`cr:ip:${ip}`, RATE_LIMIT_PER_IP, WINDOW_MS);
  if (ipLimit.limited) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(ipLimit.retryAfterSec) } },
    );
  }

  try {
    const b = await req.json().catch(() => ({}));

    const code = cap(b.code, 64);
    if (!code) {
      return NextResponse.json({ error: "Scan the QR code at the area first." }, { status: 400 });
    }

    // Per-code limit stops one area being flooded even from many IPs.
    const codeLimit = rateLimit(`cr:code:${code}`, RATE_LIMIT_PER_CODE, WINDOW_MS);
    if (codeLimit.limited) {
      return NextResponse.json(
        { error: "Several requests have already been raised for this area. Our team is on it." },
        { status: 429, headers: { "Retry-After": String(codeLimit.retryAfterSec) } },
      );
    }

    // The QR is the only source of centre/area — never taken from the body.
    const qr = await prisma.clientQrCode.findUnique({
      where: { code },
      include: {
        location: { include: { center: { select: { id: true, name: true } } } },
      },
    });
    if (!qr || !qr.active || !qr.location || qr.location.deletedAt) {
      return NextResponse.json({ error: "This code is not recognised." }, { status: 404 });
    }
    const loc = qr.location;

    const type = await prisma.cleaningRequestType.findFirst({
      where: { id: cap(b.typeId, 64) ?? "", active: true },
    });
    if (!type) {
      return NextResponse.json({ error: "Choose what you need." }, { status: 400 });
    }

    // Company must genuinely belong to this centre.
    let clientId: string | null = null;
    const rawClientId = cap(b.clientId, 64);
    if (rawClientId) {
      const client = await prisma.client.findFirst({
        where: { id: rawClientId, centerId: loc.center.id },
        select: { id: true },
      });
      if (!client) {
        return NextResponse.json({ error: "Select your company from the list." }, { status: 400 });
      }
      clientId = client.id;
    }

    const description = cap(b.description, 1000);
    const clientName = cap(b.clientName, 120);
    const clientPhone = cap(b.clientPhone, 20);
    const clientEmail = cap(b.clientEmail, 160);

    // Priority: client choice, overridden upward by keyword/type rules.
    const clientUrgent = b.priority === "URGENT";
    const detected = detectUrgency(`${type.name} ${description ?? ""}`, type.autoUrgent);
    const urgent = clientUrgent || detected.urgent;

    const cfg = await getRequestConfig();
    const assigneeId = await pickAssignee(loc.center.id);

    const request = await prisma.cleaningRequest.create({
      data: {
        ticketNo: await nextTicketNo(),
        centerId: loc.center.id,
        locationId: loc.id,
        floorId: loc.floorId,
        typeId: type.id,
        typeNameSnapshot: type.name,
        clientId,
        clientName, clientPhone, clientEmail,
        description,
        priority: urgent ? "URGENT" : "NORMAL",
        autoUrgentReason: !clientUrgent && detected.urgent ? detected.reason : null,
        status: assigneeId ? "ASSIGNED" : "NEW",
        assigneeId,
        dueAt: dueFrom(type.slaMinutes, urgent),
        statusToken: newStatusToken(),
        sourceIp: ip,
      },
      include: { location: { select: { name: true } } },
    });

    await prisma.cleaningRequestEvent.create({
      data: { requestId: request.id, toStatus: request.status, byClient: true, note: "Submitted by client" },
    });

    // Urgent requests interrupt; normal ones surface in the console and digest.
    if (urgent) {
      await raiseAlert({
        centerId: loc.center.id,
        alertType: ALERT_TYPES.CRITICAL_ISSUE,
        severity: "HIGH",
        title: `Urgent cleaning request — ${loc.name}: ${type.name}`,
        body: buildAlertBody({
          centre: loc.center.name,
          area: loc.name,
          alertType: "URGENT_CLEANING_REQUEST",
          severity: "HIGH",
          findings: [description, detected.reason ? `Auto-urgent: ${detected.reason}` : null]
            .filter(Boolean).join("\n"),
          action: `Respond within ${urgent ? Math.max(5, Math.round(type.slaMinutes / 2)) : type.slaMinutes} minutes.`,
          link: appUrl(`/housekeeping/requests?id=${request.id}`),
        }),
        subjectType: "CleaningRequest",
        subjectId: request.id,
        dedupeKey: `cr:${request.id}:urgent`,
        meta: { ticketNo: request.ticketNo, type: type.name },
      });
    }

    await logAction({
      userId: null,
      action: "HK_CLEANING_REQUEST_CREATED",
      targetType: "CleaningRequest",
      targetId: request.id,
      meta: {
        ticketNo: request.ticketNo, centre: loc.center.name, area: loc.name,
        type: type.name, priority: request.priority,
        autoUrgentReason: request.autoUrgentReason, clientId, ip,
      },
    });

    // Only the token and the human-readable number go back — no internal ids.
    return NextResponse.json(
      {
        ticketNo: request.ticketNo,
        statusToken: request.statusToken,
        statusUrl: `/qr/status/${request.statusToken}`,
        priority: request.priority,
        etaMinutes: urgent ? Math.max(5, Math.round(type.slaMinutes / 2)) : type.slaMinutes,
        area: loc.name,
      },
      { status: 201 },
    );
  } catch (e: any) {
    console.error("public cleaning request failed:", e);
    return NextResponse.json({ error: "Could not submit your request." }, { status: 500 });
  }
}

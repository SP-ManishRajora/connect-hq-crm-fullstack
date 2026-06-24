import { logAction } from "@/lib/audit";

// Tiny in-process event layer for the occupancy module. Every domain event is recorded to
// the existing AuditLog via logAction, and any registered listeners are invoked. This gives
// the "event-driven" requirement without a message bus — listeners run in the same request.
//
// Adding a side-effect later (e.g. notify ops on AgreementExpired) = register a listener;
// no service code changes.

export type OccupancyEvent =
  | "OccupancyAllocated"
  | "OccupancyReleased"
  | "OccupancyTransferred"
  | "ReservationCreated"
  | "ReservationExpired"
  | "AgreementExpired";

export type EventPayload = {
  actorId?: string | null;
  targetType?: string; // e.g. "Allocation", "Reservation", "Space"
  targetId?: string;
  meta?: Record<string, unknown>;
};

type Listener = (event: OccupancyEvent, payload: EventPayload) => void | Promise<void>;

const listeners: Listener[] = [];

export function onOccupancyEvent(fn: Listener) {
  listeners.push(fn);
}

export async function emit(event: OccupancyEvent, payload: EventPayload) {
  // Audit first — never let a listener failure lose the audit record.
  await logAction({
    userId: payload.actorId ?? null,
    action: event,
    targetType: payload.targetType,
    targetId: payload.targetId,
    meta: payload.meta,
  });
  for (const fn of listeners) {
    try {
      await fn(event, payload);
    } catch (e) {
      console.error(`occupancy listener failed for ${event}:`, e);
    }
  }
}

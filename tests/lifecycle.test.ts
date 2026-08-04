import { describe, it, expect } from "vitest";
import {
  assertTransition, isCriticalByNature, assertCanVerify, isOverdue,
  type IssueStatus,
} from "@/lib/housekeeping/issues";
import {
  assertCrTransition, detectUrgency, dueFrom, complaintReason,
  type CrStatus,
} from "@/lib/housekeeping/requests";

// State machines and the classification rules that decide severity and priority.
// These are the rules most likely to be broken by a well-meaning refactor, and
// the hardest to notice when they are.

describe("issue state machine", () => {
  it("allows the normal path", () => {
    const path: [IssueStatus, IssueStatus][] = [
      ["OPEN", "ASSIGNED"],
      ["ASSIGNED", "IN_PROGRESS"],
      ["IN_PROGRESS", "AWAITING_VERIFICATION"],
      ["AWAITING_VERIFICATION", "CLOSED"],
    ];
    for (const [from, to] of path) {
      expect(() => assertTransition(from, to)).not.toThrow();
    }
  });

  it("allows rejection back into rework", () => {
    expect(() => assertTransition("AWAITING_VERIFICATION", "REJECTED")).not.toThrow();
    expect(() => assertTransition("REJECTED", "IN_PROGRESS")).not.toThrow();
  });

  it("treats CLOSED as terminal — a recurrence is a NEW issue", () => {
    // This keeps rectification-time statistics honest: reopening would let one
    // row accumulate several unrelated fix cycles.
    expect(() => assertTransition("CLOSED", "IN_PROGRESS")).toThrow(/Cannot move/);
    expect(() => assertTransition("CLOSED", "CLOSED")).toThrow();
  });

  it("treats CANCELLED as terminal", () => {
    expect(() => assertTransition("CANCELLED", "ASSIGNED")).toThrow();
  });

  it("refuses to skip the work — OPEN cannot jump straight to CLOSED", () => {
    expect(() => assertTransition("OPEN", "CLOSED")).toThrow();
    expect(() => assertTransition("OPEN", "AWAITING_VERIFICATION")).toThrow();
  });
});

describe("hazard auto-escalation", () => {
  it.each([
    "Exposed wire near the washbasin",
    "open electrical panel in the plant room",
    "diesel leak under the generator",
    "blocked emergency exit on level 2",
    "major water overflow in bathroom 3",
  ])("treats %j as inherently critical", (title) => {
    expect(isCriticalByNature(title)).toBe(true);
  });

  it("also scans the description, not just the title", () => {
    expect(isCriticalByNature("Have a look", "there is an exposed wire behind the panel")).toBe(true);
  });

  it("leaves ordinary requests alone", () => {
    expect(isCriticalByNature("Dustbin is full")).toBe(false);
    expect(isCriticalByNature("Please clean the table")).toBe(false);
  });
});

describe("four-eyes verification", () => {
  it("stops the assignee signing off their own work", () => {
    expect(() => assertCanVerify({ assigneeId: "u1" }, "u1", "OPS")).toThrow(/your own work/);
  });

  it("allows a colleague", () => {
    expect(() => assertCanVerify({ assigneeId: "u1" }, "u2", "OPS")).not.toThrow();
  });

  it("lets ADMIN/OWNER override — a single-staff site would otherwise deadlock", () => {
    expect(() => assertCanVerify({ assigneeId: "u1" }, "u1", "ADMIN")).not.toThrow();
    expect(() => assertCanVerify({ assigneeId: "u1" }, "u1", "OWNER")).not.toThrow();
  });
});

describe("overdue detection", () => {
  const past = new Date(Date.now() - 3600_000);
  const future = new Date(Date.now() + 3600_000);

  it("flags a past due date on open work", () => {
    expect(isOverdue({ dueAt: past, status: "ASSIGNED" })).toBe(true);
  });

  it("never flags closed or cancelled work", () => {
    expect(isOverdue({ dueAt: past, status: "CLOSED" })).toBe(false);
    expect(isOverdue({ dueAt: past, status: "CANCELLED" })).toBe(false);
  });

  it("handles a missing due date", () => {
    expect(isOverdue({ dueAt: null, status: "ASSIGNED" })).toBe(false);
    expect(isOverdue({ dueAt: future, status: "ASSIGNED" })).toBe(false);
  });
});

describe("cleaning-request state machine", () => {
  it("allows the normal path", () => {
    const path: [CrStatus, CrStatus][] = [
      ["NEW", "ASSIGNED"],
      ["ASSIGNED", "ACCEPTED"],
      ["ACCEPTED", "ON_THE_WAY"],
      ["ON_THE_WAY", "IN_PROGRESS"],
      ["IN_PROGRESS", "COMPLETED"],
      ["COMPLETED", "AWAITING_CONFIRMATION"],
      ["AWAITING_CONFIRMATION", "CLOSED"],
    ];
    for (const [from, to] of path) {
      expect(() => assertCrTransition(from, to)).not.toThrow();
    }
  });

  it("allows a client reopen from either completed state", () => {
    expect(() => assertCrTransition("COMPLETED", "REOPENED")).not.toThrow();
    expect(() => assertCrTransition("AWAITING_CONFIRMATION", "REOPENED")).not.toThrow();
  });

  it("refuses to complete work that never started", () => {
    expect(() => assertCrTransition("NEW", "COMPLETED")).toThrow();
    expect(() => assertCrTransition("ASSIGNED", "COMPLETED")).toThrow();
  });

  it("treats CLOSED as terminal", () => {
    expect(() => assertCrTransition("CLOSED", "REOPENED")).toThrow();
  });
});

describe("request urgency detection", () => {
  it.each([
    ["water spill near the door", "liquid spill"],
    ["there is broken glass on the floor", "broken glass"],
    ["the toilet is overflowing", "overflow"],
    ["someone vomited in the corridor", "biological waste"],
  ])("auto-escalates %j", (text) => {
    expect(detectUrgency(text, false).urgent).toBe(true);
  });

  it("honours a type marked always-urgent", () => {
    const d = detectUrgency("routine wipe down", true);
    expect(d.urgent).toBe(true);
    expect(d.reason).toMatch(/always urgent/);
  });

  it("leaves an ordinary request normal", () => {
    expect(detectUrgency("please clean the table", false).urgent).toBe(false);
  });

  // Regression: a bare "meeting" keyword escalated every routine meeting-room
  // clean. The brief means a meeting happening NOW, not the name of a room.
  it("does not escalate a routine meeting-room clean", () => {
    expect(detectUrgency("please clean the meeting room table", false).urgent).toBe(false);
    expect(detectUrgency("Meeting-room cleaning", false).urgent).toBe(false);
  });

  it("does escalate when a meeting is actually imminent", () => {
    expect(detectUrgency("client meeting in progress, need the room tidied", false).urgent).toBe(true);
    expect(detectUrgency("guest arriving in 10 minutes", false).urgent).toBe(true);
  });

  it("records WHY it escalated, for the audit trail", () => {
    expect(detectUrgency("broken glass by the lift", false).reason).toBe("broken glass");
  });
});

describe("SLA due times", () => {
  const from = new Date("2026-08-03T10:00:00Z");

  it("uses the type target for a normal request", () => {
    expect(dueFrom(20, false, from).getTime() - from.getTime()).toBe(20 * 60_000);
  });

  it("halves the target when urgent", () => {
    expect(dueFrom(20, true, from).getTime() - from.getTime()).toBe(10 * 60_000);
  });

  it("never goes below a 5-minute floor", () => {
    // Halving a 5-minute target would leave staff no chance to respond at all.
    expect(dueFrom(5, true, from).getTime() - from.getTime()).toBe(5 * 60_000);
  });
});

describe("complaint conversion", () => {
  const base = { slaBreached: false, reopenCount: 0, confirmation: null, isComplaint: false };

  it("converts when the client says it was not completed", () => {
    expect(complaintReason({ ...base, confirmation: "NOT_COMPLETED" })).toMatch(/not completed/i);
  });

  it("converts on a reopen", () => {
    expect(complaintReason({ ...base, reopenCount: 1 })).toMatch(/reopened/i);
  });

  it("converts on an SLA breach", () => {
    expect(complaintReason({ ...base, slaBreached: true })).toMatch(/service-level/i);
  });

  it("leaves a satisfied request alone", () => {
    expect(complaintReason({ ...base, confirmation: "SATISFACTORY" })).toBeNull();
  });

  it("does not re-convert something already flagged", () => {
    expect(complaintReason({ ...base, slaBreached: true, isComplaint: true })).toBeNull();
  });
});

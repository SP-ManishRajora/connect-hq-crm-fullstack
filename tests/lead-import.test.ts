import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import {
  dedupeKey,
  extractPhones,
  isOldDataSource,
  mapStatus,
  matchCenter,
  parseBudget,
  parseLeadWorkbook,
  parseSeats,
  parseSheetDate,
} from "@/lib/leadImport";

const TODAY = new Date("2026-10-09T06:30:00Z");
const CENTERS = [
  { id: "cp", name: "CHQ_CP" },
  { id: "gp", name: "CHQ-GP" },
  { id: "noida", name: "CHQ_NOIDA" },
];

describe("parseSheetDate", () => {
  it("reads US month/day/year text", () => {
    expect(parseSheetDate("11/18/2024", TODAY)?.toISOString()).toBe("2024-11-18T06:30:00.000Z");
  });
  it("rejects impossible, typo'd and future dates", () => {
    expect(parseSheetDate("02/29/2025", TODAY)).toBeNull();
    expect(parseSheetDate("11/28/20225", TODAY)).toBeNull();
    expect(parseSheetDate("9/21/2029", TODAY)).toBeNull();
    expect(parseSheetDate("", TODAY)).toBeNull();
  });
  it("reads Excel serial numbers", () => {
    // 45614 = 18 Nov 2024
    expect(parseSheetDate(45614, TODAY)?.toISOString().slice(0, 10)).toBe("2024-11-18");
  });
});

describe("extractPhones", () => {
  it("normalises spaced, prefixed and multiple numbers", () => {
    expect(extractPhones("98105 18699")).toEqual(["9810518699"]);
    expect(extractPhones("+91 88104 39605")).toEqual(["8810439605"]);
    expect(extractPhones("8700015764/7458 943 730")).toEqual(["8700015764", "7458943730"]);
    expect(extractPhones("088606 10116")).toEqual(["8860610116"]);
  });
  it("keeps the full digits of a numeric cell", () => {
    expect(extractPhones(919872012345)).toEqual(["9872012345"]);
  });
  it("finds nothing in junk", () => {
    expect(extractPhones("No")).toEqual([]);
    expect(extractPhones("Reference")).toEqual([]);
    expect(extractPhones("477008370")).toEqual([]);
  });
});

describe("parseSeats / parseBudget", () => {
  it("splits counts from workspace types", () => {
    expect(parseSeats("5")).toEqual({ seats: 5, workspaceType: null });
    expect(parseSeats("60-70")).toEqual({ seats: 60, workspaceType: null });
    expect(parseSeats("Daypass:3")).toEqual({ seats: 3, workspaceType: "Day pass" });
    expect(parseSeats("4dp")).toEqual({ seats: 4, workspaceType: "Day pass" });
    expect(parseSeats("Virtual")).toEqual({ seats: null, workspaceType: "Virtual" });
    expect(parseSeats("manager cabin")).toEqual({ seats: null, workspaceType: "Cabin" });
  });
  it("reads plain budgets only", () => {
    expect(parseBudget("35k")).toBe(35000);
    expect(parseBudget("60000")).toBe(60000);
    expect(parseBudget("25-30k")).toBeNull();
  });
});

describe("mapStatus / matchCenter", () => {
  it("maps sheet statuses onto the pipeline", () => {
    expect(mapStatus("Not Interested", false)).toBe("Lost");
    expect(mapStatus("Denied", true)).toBe("Lost");
    expect(mapStatus("Deal Closed (daypass)", true)).toBe("Payment");
    expect(mapStatus("In Discussion", false)).toBe("Connect");
    expect(mapStatus("in Discussion", true)).toBe("Visited");
    expect(mapStatus("", false)).toBe("Lead");
  });
  it("matches locations to centers, and refuses mixed ones", () => {
    expect(matchCenter("CP", CENTERS)).toBe("cp");
    expect(matchCenter("Green Park", CENTERS)).toBe("gp");
    expect(matchCenter("Sec-8", CENTERS)).toBe("noida");
    expect(matchCenter("SEC-8", CENTERS)).toBe("noida");
    expect(matchCenter("CP/GP", CENTERS)).toBeNull();
    expect(matchCenter("", CENTERS)).toBeNull();
  });
});

function workbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  return wb;
}

describe("parseLeadWorkbook", () => {
  const wb = workbook({
    "Leads Generated": [
      ["Connect HQ- Lead from 18 Nov 2024"],
      ["Sr. No", "Date", "Client's Name", "Mobile No.", "No. of Seat", "Location", "", "Company", "Email",
        "Remarks at the time of call", "Remarks at the time of follow up", "Status", "Source", "Probability of Visit", "Month"],
      [1, "11/18/2024", "Agamvir Singh", "9818201629", "5", "GP", "", "", "agamvir.singh@rnbglobal.edu.in",
        "", "", "Not Interested", "Form", "No Visit", "Nov 2024"],
      [2, "12/5/2024", "<no name>", "8800590244", "2", "Sec-8", "", "", "NA",
        "Low budget", "*6/2/2025 disconnected", "Denied", "Call", "Visited", "Dec 2024"],
      [3, "9/21/2029", "Kailash Chandra", "93555 13516", "Daypass:3", "CP", "", "", "", "", "", "In Discussion", "Call", "No", ""],
      [4, "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
      [5, "6/12/2025", "Archana(realtor)", "8447073928", "40", "Sec-8", "", "", "", "", "", "", "", "", ""],
    ],
    "In Discussion": [
      ["SNO", "Date", "Client's Name", "Mobile No.", "Seats", "Location"],
      [1, "11/18/2024", "Agamvir Singh", "98182 01629", "5", "GP"],
    ],
    "SECTOR-8": [
      ["Sr. No", "Floor No.", "Cabin No.", "No. of Seats", "Occuied seat", "Vacant seat"],
      [1, "Basement", "B-1", 3, 0, 3],
    ],
  });
  const res = parseLeadWorkbook(wb, CENTERS, TODAY);

  it("skips non-lead sheets and blank rows", () => {
    expect(res.skippedSheets.map((s) => s.sheet)).toEqual(["SECTOR-8"]);
    expect(res.blankRows).toBe(1);
    expect(res.rows).toHaveLength(5);
  });

  it("writes the enquiry date into the source", () => {
    const [first] = res.rows;
    expect(first.source).toBe("Old Data · 18 Nov 2024");
    expect(isOldDataSource(first.source)).toBe(true);
    expect(first.createdAt?.toISOString()).toBe("2024-11-18T06:30:00.000Z");
    expect(first).toMatchObject({ name: "Agamvir Singh", phone: "9818201629", status: "Lost", centerId: "gp", seatsNeeded: 5 });
    expect(first.notes).toContain("Original source: Form");
    expect(first.notes).toContain("Original status: Not Interested");
  });

  it("keeps remarks as comments and junk in notes", () => {
    const r = res.rows[1];
    expect(r.name).toBe("Unknown");
    expect(r.email).toBeNull();
    expect(r.notes).toContain("Email (as written): NA");
    expect(r.remarks).toEqual(["Remark at the time of call:\nLow budget", "Remark at follow-up:\n*6/2/2025 disconnected"]);
    expect(r.status).toBe("Lost");
  });

  it("keeps an unreadable date as written instead of guessing", () => {
    const r = res.rows[2];
    expect(r.source).toBe("Old Data · 9/21/2029");
    expect(r.createdAt).toBeNull();
    expect(r.dateProblem).toBe("9/21/2029");
    expect(r).toMatchObject({ seatsNeeded: 3, workspaceType: "Day pass", status: "Connect", centerId: "cp" });
  });

  it("flags brokers and collapses copies of the same enquiry", () => {
    expect(res.rows[3].sourceType).toBe("Broker");
    expect(dedupeKey(res.rows[0])).toBe(dedupeKey(res.rows[4]));
  });
});

describe("old lead promotion", () => {
  it("moves an untouched import to Old Leads, keeping the date", async () => {
    const { promotedSource, isOldDataSource, isImportedSource } = await import("@/lib/oldLeads");
    expect(promotedSource("Old Data · 18 Nov 2024")).toBe("Old Leads · 18 Nov 2024");
    expect(promotedSource("Old Data")).toBe("Old Leads");
    expect(promotedSource("Old Leads · 18 Nov 2024")).toBeNull();
    expect(promotedSource("CALL")).toBeNull();
    expect(isOldDataSource("Old Leads · 18 Nov 2024")).toBe(false);
    expect(isImportedSource("Old Leads · 18 Nov 2024")).toBe(true);
    expect(isOldDataSource("Old Database")).toBe(false);
  });
  it("still recognises a promoted lead on re-upload", () => {
    const row = { phone: "9818201629", email: null, name: "A", source: "Old Data · 18 Nov 2024" };
    expect(dedupeKey(row)).toBe(dedupeKey({ ...row, source: "Old Leads · 18 Nov 2024" }));
  });
});

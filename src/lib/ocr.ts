// OCR stub. In production, swap to Tesseract.js, AWS Textract, or Google Document AI.
// The stub returns plausible parsed fields so the UI can be tested end-to-end.
//
// Drop-in replacement example with tesseract.js:
//   const { data } = await Tesseract.recognize(imagePath, "eng");
//   const text = data.text;
//   ...regex extract amount, gst, invoiceNo, dates...

export type ParsedInvoice = {
  invoiceNo?: string;
  invoiceDate?: string; // ISO
  amount?: number;
  gst?: number;
  poNumber?: string;
  rawText?: string;
};

export type ParsedContract = {
  startDate?: string;
  endDate?: string;
  renewDate?: string;
  monthlyRent?: number;
  incrementPct?: number;
  rawText?: string;
};

export async function ocrInvoice(filePath: string): Promise<ParsedInvoice> {
  // STUB — pretend extraction. Replace with real OCR.
  return {
    invoiceNo: `EXTRACTED-${Date.now()}`,
    invoiceDate: new Date().toISOString(),
    amount: 0,
    gst: 0,
    poNumber: "",
    rawText: `OCR stub for ${filePath}. Wire a real OCR provider to populate this.`,
  };
}

// --- Generator panel / fuel gauge OCR (Phase 7) ----------------------------
//
// Reads a photographed control panel or tank gauge. STUB by default: it returns
// nulls with zero confidence rather than invented numbers, so the operator's
// typed reading is always used and the "OCR vs manual mismatch" rule simply
// never fires until a real engine is wired in. Inventing plausible values here
// would silently corrupt the fuel ledger.
//
// Wire a real engine by setting HK_OCR_DRIVER=tesseract (or routing to the
// Phase 5 vision model via readMeter()), keeping this same return shape.

export type ParsedGeneratorPanel = {
  fuelReading?: number | null;      // litres or gauge units
  hourMeter?: number | null;
  voltage?: number | null;
  current?: number | null;
  frequency?: number | null;
  confidence: number;               // 0–1; 0 means "no reading attempted"
  engine: string;                   // which driver produced this
  rawText?: string;
};

export async function ocrGeneratorPanel(filePath: string): Promise<ParsedGeneratorPanel> {
  const driver = process.env.HK_OCR_DRIVER || "stub";

  if (driver === "stub") {
    return {
      fuelReading: null,
      hourMeter: null,
      voltage: null,
      current: null,
      frequency: null,
      confidence: 0,
      engine: "stub",
      rawText: `OCR not configured (HK_OCR_DRIVER=stub). Operator-entered readings are authoritative. Photo: ${filePath}`,
    };
  }

  // Real drivers plug in here. Kept as an explicit failure rather than a silent
  // fallback so a misconfigured driver is visible instead of quietly degrading.
  return {
    fuelReading: null,
    hourMeter: null,
    voltage: null,
    current: null,
    frequency: null,
    confidence: 0,
    engine: driver,
    rawText: `OCR driver "${driver}" is not implemented yet.`,
  };
}

// Pulls numbers out of raw OCR text. Exported so a real driver can reuse it and
// so it is unit-testable independently of any engine.
export function parseGeneratorText(text: string): Partial<ParsedGeneratorPanel> {
  const num = (re: RegExp): number | null => {
    const m = text.match(re);
    if (!m) return null;
    const v = parseFloat(m[1].replace(/,/g, ""));
    return Number.isFinite(v) ? v : null;
  };
  return {
    hourMeter: num(/(?:hour|hrs?|running\s*hours?)\D{0,10}([\d,]+\.?\d*)/i),
    fuelReading: num(/(?:fuel|diesel|tank)\D{0,10}([\d,]+\.?\d*)/i),
    voltage: num(/([\d,]+\.?\d*)\s*V\b/i),
    current: num(/([\d,]+\.?\d*)\s*A\b/i),
    frequency: num(/([\d,]+\.?\d*)\s*Hz\b/i),
  };
}

export async function ocrContract(filePath: string): Promise<ParsedContract> {
  return {
    startDate: undefined,
    endDate: undefined,
    renewDate: undefined,
    monthlyRent: 0,
    incrementPct: 5,
    rawText: `OCR stub for ${filePath}. Wire a real OCR provider to populate this.`,
  };
}

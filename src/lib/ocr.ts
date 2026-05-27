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

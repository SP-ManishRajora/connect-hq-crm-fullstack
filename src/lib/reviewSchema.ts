// Shared Review/Feedback validation — imported by both the client form and the
// API route so the rules (including the conditional visitor requirements) stay
// identical on both sides.
import { z } from "zod";
import { isValidIndianPhone, isValidEmail } from "./validators";

// Strip HTML tags and collapse whitespace. Prevents stored XSS from raw markup
// while keeping the text readable. React already escapes on render, but we
// sanitise at the boundary so the stored value is clean for any consumer
// (exports, emails, non-React surfaces).
export function sanitizeText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<[^>]*>/g, "") // drop any HTML tags
    .trim();
}

const requiredText = (label: string, max = 500) =>
  z
    .string({ required_error: `${label} is required` })
    .transform(sanitizeText)
    .pipe(
      z
        .string()
        .min(1, `${label} is required`)
        .max(max, `${label} is too long`)
    );

export const reviewSchema = z
  .object({
    name: requiredText("Name", 120),
    phoneNumber: z
      .string({ required_error: "Phone number is required" })
      .transform(sanitizeText)
      .pipe(z.string().min(1, "Phone number is required"))
      .refine(isValidIndianPhone, "Enter a valid phone number"),
    // Required for clients only; enforced conditionally in superRefine below.
    companyName: z
      .string()
      .optional()
      .transform(sanitizeText)
      .pipe(z.string().max(160, "Company name is too long")),
    email: z
      .string()
      .optional()
      .transform((v) => sanitizeText(v))
      .refine((v) => v === "" || isValidEmail(v), "Enter a valid email")
      .transform((v) => (v === "" ? null : v)),
    feedback: requiredText("Feedback", 5000),
    isVisitor: z.coerce.boolean().default(false),
    // Optional at the object level; enforced conditionally in superRefine below.
    purposeOfVisit: z
      .string()
      .optional()
      .transform((v) => sanitizeText(v)),
  })
  .superRefine((val, ctx) => {
    if (val.isVisitor) {
      if (!val.purposeOfVisit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["purposeOfVisit"],
          message: "Purpose of visit is required for visitors",
        });
      }
    } else if (!val.companyName) {
      // Company name is mandatory for clients but optional for visitors.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["companyName"],
        message: "Company name is required",
      });
    }
  })
  // When not a visitor, discard any visitor-specific values so we never store
  // stray data (Acceptance: "Do not save empty visitor-specific values").
  .transform((val) => ({
    ...val,
    purposeOfVisit: val.isVisitor ? val.purposeOfVisit || null : null,
  }));

export type ReviewInput = z.input<typeof reviewSchema>;
export type ReviewParsed = z.output<typeof reviewSchema>;

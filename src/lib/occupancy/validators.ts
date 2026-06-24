import { z } from "zod";

// DTO + validation layer for the occupancy services. Each schema is the single contract
// shared by the API route and the service; routes call `parse` and surface a 400 on failure.

const isoDate = z.coerce.date({ errorMap: () => ({ message: "Invalid date" }) });

export const allocateSchema = z
  .object({
    clientId: z.string().min(1, "clientId required"),
    contractId: z.string().min(1).optional().nullable(),
    items: z
      .array(
        z.object({
          spaceId: z.string().min(1, "spaceId required"),
          seatsTaken: z.number().int().positive().default(1),
        }),
      )
      .min(1, "At least one space is required"),
    startDate: isoDate,
    endDate: isoDate.optional().nullable(),
  })
  .refine((d) => !d.endDate || d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });
export type AllocateDTO = z.infer<typeof allocateSchema>;

export const releaseSchema = z.object({
  // Defaults to vacated now; "EXPIRED" when released because a contract lapsed.
  reason: z.enum(["TERMINATED", "EXPIRED"]).default("TERMINATED"),
  vacatedAt: isoDate.optional(),
});
export type ReleaseDTO = z.infer<typeof releaseSchema>;

export const reserveSchema = z
  .object({
    spaceId: z.string().min(1, "spaceId required"),
    clientId: z.string().min(1).optional().nullable(),
    expiresAt: isoDate,
    notes: z.string().max(2000).optional().nullable(),
  })
  .refine((d) => d.expiresAt > new Date(), {
    message: "expiresAt must be in the future",
    path: ["expiresAt"],
  });
export type ReserveDTO = z.infer<typeof reserveSchema>;

export const transferSchema = z.object({
  items: z
    .array(
      z.object({
        spaceId: z.string().min(1),
        toClientId: z.string().min(1, "toClientId required"),
        toContractId: z.string().min(1).optional().nullable(),
        seatsTaken: z.number().int().positive().default(1),
      }),
    )
    .min(1, "At least one transfer is required"),
  startDate: isoDate.optional(), // defaults to now in the service
  endDate: isoDate.optional().nullable(),
  reason: z.string().max(2000).optional().nullable(),
});
export type TransferDTO = z.infer<typeof transferSchema>;

import { prisma } from "@/lib/db";

export async function logAction({
  userId,
  action,
  targetType,
  targetId,
  meta,
}: {
  userId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: object;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        targetType: targetType || null,
        targetId: targetId || null,
        meta: meta ? JSON.stringify(meta) : null,
      },
    });
  } catch {
    // never let audit logging break the main flow
  }
}

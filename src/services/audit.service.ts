import { prisma } from "../db/prisma";
import type { AuditAction } from "@prisma/client";
export async function createAuditLog(params: {
  userId?: string | null;
  action: AuditAction;
  resource?: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? null,
        action: params.action,
        resource: params.resource ?? null,
        resourceId: params.resourceId ?? null,
        ipAddress: params.ipAddress ?? null,
        userAgent: params.userAgent ?? null,
        metadata: (params.metadata as any) ?? undefined,
      },
    });
  } catch (error) { console.error("Failed to write audit log:", error); }
}

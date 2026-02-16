import { prisma } from "../db/prisma.js";

export async function writeAuditLog(input: {
  actorUserId?: string;
  actorLoginName: string;
  action: string;
  targetType?: string;
  targetId?: string;
  payload?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      actorLoginName: input.actorLoginName,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      payloadJson: input.payload ? JSON.stringify(input.payload) : undefined
    }
  });
}

export async function resolveActorLoginName(actorUserId?: string): Promise<string> {
  if (!actorUserId) return "system";
  const user = await prisma.user.findUnique({ where: { id: actorUserId }, select: { loginName: true } });
  return user?.loginName ?? "unknown";
}

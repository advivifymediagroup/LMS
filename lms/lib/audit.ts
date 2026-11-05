import { Prisma } from "@prisma/client";

export type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

export type AuditInput = {
  actorId?: number | null;
  targetUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: number | string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

const secretKey =
  /(password|pass(word)?hash|secret|token|api[_-]?key|authorization|cookie|credential)/i;

function sanitize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Prisma.Decimal) return value.toString();
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        secretKey.test(key) ? "[REDACTED]" : sanitize(item, seen),
      ]),
    );
  }
  return String(value);
}

export async function writeAudit(tx: AuditClient, input: AuditInput) {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      targetUserId: input.targetUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId == null ? null : String(input.entityId),
      before: input.before === undefined ? undefined : sanitize(input.before) as Prisma.InputJsonValue,
      after: input.after === undefined ? undefined : sanitize(input.after) as Prisma.InputJsonValue,
      metadata: input.metadata === undefined ? undefined : sanitize(input.metadata) as Prisma.InputJsonValue,
    },
  });
}

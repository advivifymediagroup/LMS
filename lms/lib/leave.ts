import type { LeaveType, User } from "@prisma/client";
import { db } from "./db";
import { addDays, addMonths, countLeaveDays, datesBetween, isWorkingDay, toIso, type Half } from "./leave-days";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.setting.findUnique({ where: { key } });
  return (row?.value as T) ?? fallback;
}

export async function todayIso() {
  const tz = await getSetting("timezone", "Asia/Kolkata");
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

export const fromIso = (iso: string) => new Date(iso + "T00:00:00Z");

/** Per active leave type: ledger total, days held by pending requests, and what's left to apply. */
export async function getBalances(userId: number, excludeRequestId?: number) {
  const [types, ledger, pending] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
    db.leaveLedger.groupBy({ by: ["leaveTypeId"], where: { userId }, _sum: { days: true } }),
    db.leaveRequest.groupBy({
      by: ["leaveTypeId"],
      where: { userId, status: "PENDING", ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}) },
      _sum: { days: true },
    }),
  ]);
  return types.map((type) => {
    const balance = Number(ledger.find((l) => l.leaveTypeId === type.id)?._sum.days ?? 0);
    const held = Number(pending.find((p) => p.leaveTypeId === type.id)?._sum.days ?? 0);
    return { type, balance, pending: held, available: balance - held };
  });
}

export type LeaveInput = {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  startHalf: Half;
  endHalf: Half;
};

export type LeaveCheck =
  | { ok: true; days: number; available: number | null; warning?: string; type: LeaveType }
  | { ok: false; error: string; days?: number; available?: number | null };

/** Every policy rule for a leave application. Used for the live preview and on submit. */
export async function checkLeave(user: User, input: LeaveInput): Promise<LeaveCheck> {
  const { startDate: start, endDate: end, startHalf } = input;
  const single = start === end;
  const endHalf = single ? startHalf : input.endHalf;

  const type = await db.leaveType.findFirst({ where: { id: input.leaveTypeId, isActive: true } });
  if (!type) return { ok: false, error: "Choose a leave type." };
  if (end < start) return { ok: false, error: "End date is before start date." };
  if (!type.allowHalfDay && (startHalf !== "FULL" || endHalf !== "FULL"))
    return { ok: false, error: `${type.name} can't be taken as a half day.` };
  if (!single && (startHalf === "FIRST" || endHalf === "SECOND"))
    return { ok: false, error: "For several days, a half day can only be the second half of the first day or the first half of the last day." };

  const today = await todayIso();
  if (type.blockedOnProbation) {
    const ends = await probationEnd(user);
    if (today < ends) return { ok: false, error: `${type.name} isn't available during probation (ends ${ends}). Apply for Leave Without Pay instead.` };
  }
  if (type.blockedOnNotice && user.onNoticePeriod)
    return { ok: false, error: `${type.name} isn't available during your notice period. Apply for Leave Without Pay instead.` };

  const [workingDays, holidayRows] = await Promise.all([
    getSetting("workingDays", [1, 2, 3, 4, 5]),
    db.holiday.findMany({ where: { date: { gte: fromIso(start), lte: fromIso(end) } } }),
  ]);
  const holidays = new Set(holidayRows.filter((h) => !h.isOptional).map((h) => toIso(h.date)));
  const days = countLeaveDays(start, end, startHalf, endHalf, { workingDays, holidays, sandwichCounts: type.sandwichCounts });
  if (days === 0) return { ok: false, error: "The selected dates have no working days." };

  if (type.backdateDays > 0) {
    const earliest = addDays(today, -type.backdateDays);
    if (start < earliest) return { ok: false, error: `${type.name} can be applied up to ${type.backdateDays} days back (earliest ${earliest}).` };
  } else {
    const long = type.longLeaveDays !== null && days > type.longLeaveDays;
    const notice = long ? type.longNoticeDays : type.noticeDays;
    const earliest = addDays(today, notice);
    if (start < earliest) {
      const why = long ? ` for more than ${type.longLeaveDays} days` : "";
      return { ok: false, days, error: notice ? `${type.name}${why} needs ${notice} days' notice (earliest ${earliest}).` : "Start date can't be in the past." };
    }
  }

  if (type.optionalHolidayOnly) {
    const optional = new Set(holidayRows.filter((h) => h.isOptional).map((h) => toIso(h.date)));
    const bad = datesBetween(start, end).filter((d) => isWorkingDay(d, { workingDays, holidays }) && !optional.has(d));
    if (bad.length) return { ok: false, error: `${type.name} can only be taken on optional holidays. Not optional: ${bad.join(", ")}.` };
  }

  // ponytail: any overlap blocks, even first-half + second-half on the same day. Split by half if that's needed.
  const clash = await db.leaveRequest.findFirst({
    where: { userId: user.id, status: { in: ["PENDING", "APPROVED"] }, startDate: { lte: fromIso(end) }, endDate: { gte: fromIso(start) } },
  });
  if (clash)
    return { ok: false, days, error: `Overlaps your ${clash.status.toLowerCase()} leave from ${toIso(clash.startDate)} to ${toIso(clash.endDate)}.` };

  if (!type.needsBalance) return { ok: true, days, available: null, type, warning: "This leave is unpaid." };

  const bal = (await getBalances(user.id)).find((b) => b.type.id === type.id);
  const available = bal?.available ?? 0;
  if (days > available)
    return { ok: false, days, available, error: `Insufficient leave balance: ${available} day(s) available, ${days} requested.` };
  const warning =
    type.certificateAfterDays !== null && days > type.certificateAfterDays
      ? `A medical certificate from a registered doctor may be required for more than ${type.certificateAfterDays} days.`
      : undefined;
  return { ok: true, days, available, type, warning };
}

export async function probationEnd(user: Pick<User, "joiningDate">) {
  return addMonths(toIso(user.joiningDate), await getSetting("probationMonths", 3));
}

/** Who decides (and gets emailed about) a user's leave: their manager, else every other active admin. */
export async function approversFor(user: Pick<User, "id" | "managerId">) {
  if (user.managerId) {
    const m = await db.user.findFirst({ where: { id: user.managerId, isActive: true } });
    if (m) return [m];
  }
  return db.user.findMany({ where: { role: "ADMIN", isActive: true, id: { not: user.id } } });
}

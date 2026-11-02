import { db } from "./db";
import { fromIso, getSetting } from "./leave";
import { countLeaveDays, toIso } from "./leave-days";

export type ReportFilter = { from: string; to: string; departmentId?: number };

/** Approved leave days per employee and leave type, counting only the days inside [from, to]. */
export async function usageReport({ from, to, departmentId }: ReportFilter) {
  const [types, users, leaves, workingDays, holidayRows] = await Promise.all([
    db.leaveType.findMany({ orderBy: { id: "asc" } }),
    db.user.findMany({
      where: { ...(departmentId && { departmentId }), OR: [{ isActive: true }, { leaves: { some: {} } }] },
      include: { department: true },
      orderBy: { name: "asc" },
    }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: fromIso(to) }, endDate: { gte: fromIso(from) }, ...(departmentId && { user: { departmentId } }) },
      include: { leaveType: true },
    }),
    getSetting<number[]>("workingDays", [1, 2, 3, 4, 5]),
    db.holiday.findMany({ where: { isOptional: false, date: { gte: fromIso(from), lte: fromIso(to) } } }),
  ]);
  const holidays = new Set(holidayRows.map((h) => toIso(h.date)));

  const days = new Map<number, Record<string, number>>();
  for (const l of leaves) {
    const s = toIso(l.startDate), e = toIso(l.endDate);
    // A leave that crosses the range edge is recounted for the part inside it.
    const n = s >= from && e <= to
      ? Number(l.days)
      : countLeaveDays(s < from ? from : s, e > to ? to : e, s < from ? "FULL" : l.startHalf, e > to ? "FULL" : l.endHalf,
          { workingDays, holidays, sandwichCounts: l.leaveType.sandwichCounts });
    const row = days.get(l.userId) ?? {};
    row[l.leaveType.code] = (row[l.leaveType.code] ?? 0) + n;
    days.set(l.userId, row);
  }

  const rows = users
    .filter((u) => u.isActive || days.has(u.id))
    .map((u) => {
      const byType = days.get(u.id) ?? {};
      return { employeeId: u.employeeId, name: u.name, department: u.department?.name ?? "", byType, total: Object.values(byType).reduce((a, b) => a + b, 0) };
    });
  return { types: types.map((t) => t.code), rows };
}

export function parseReportFilter(q: Record<string, string | string[] | undefined>, year: string): ReportFilter {
  const date = (v: unknown, fallback: string) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : fallback);
  const from = date(q.from, `${year}-01-01`);
  const to = date(q.to, `${year}-12-31`);
  return { from, to: to < from ? from : to, departmentId: Number(q.dept) || undefined };
}

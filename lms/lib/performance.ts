// Monthly performance reports: who can see them, attendance from leave records, and first-draft data.
import type { PerformanceReport, User } from "@prisma/client";
import { db } from "./db";
import { fromIso, getSetting } from "./leave";
import { addDays, addMonths, countLeaveDays, datesBetween, isWorkingDay, toIso } from "./leave-days";
import { reportTemplate, type ReportData } from "./team-config";

type Viewer = Pick<User, "id" | "role" | "departmentId">;

/** Owner, admins, and the lead of the owner's team. */
export const canViewReport = (me: Viewer, owner: Pick<User, "id" | "departmentId">) =>
  me.id === owner.id || me.role === "ADMIN" || (me.role === "LEAD" && me.departmentId !== null && me.departmentId === owner.departmentId);
export const canReviewReport = (me: Viewer, owner: Pick<User, "id" | "departmentId">) => me.id !== owner.id && canViewReport(me, owner);

export const monthBounds = (month: string) => ({ first: `${month}-01`, last: addDays(addMonths(`${month}-01`, 1), -1) });
export const monthName = (month: string, withYear = false) =>
  fromIso(`${month}-01`).toLocaleDateString("en-GB", { month: "long", ...(withYear && { year: "numeric" }), timeZone: "UTC" });

/** Working days, days on leave and sick days in the month (up to today for the current month). */
export async function attendance(userId: number, month: string, today: string) {
  const { first, last: monthEnd } = monthBounds(month);
  const last = monthEnd > today ? today : monthEnd;
  const [workingDays, holidayRows, leaves] = await Promise.all([
    getSetting("workingDays", [1, 2, 3, 4, 5]),
    db.holiday.findMany({ where: { isOptional: false, date: { gte: fromIso(first), lte: fromIso(monthEnd) } } }),
    db.leaveRequest.findMany({ where: { userId, status: "APPROVED", startDate: { lte: fromIso(last) }, endDate: { gte: fromIso(first) } }, include: { leaveType: true } }),
  ]);
  const o = { workingDays, holidays: new Set(holidayRows.map((h) => toIso(h.date))), sandwichCounts: false };
  const working = last < first ? 0 : datesBetween(first, last).filter((d) => isWorkingDay(d, o)).length;
  let away = 0, sick = 0;
  const sickDates: string[] = [];
  for (const l of leaves) {
    const [s, e] = [toIso(l.startDate), toIso(l.endDate)];
    const [cs, ce] = [s < first ? first : s, e > last ? last : e];
    const days = countLeaveDays(cs, ce, cs === s ? l.startHalf : "FULL", ce === e ? l.endHalf : "FULL", o);
    if (l.leaveType.code === "SL") {
      sick += days;
      sickDates.push(...datesBetween(cs, ce).filter((d) => isWorkingDay(d, o)));
    } else away += days;
  }
  return { working, present: Math.max(0, working - away - sick), absent: away, sick, sickDates: sickDates.sort() };
}

/** First draft: last report's designation and responsibilities, and this month's tasks grouped by project. */
export async function draftReport(user: User & { department: { name: string } | null }, month: string) {
  const { first, last } = monthBounds(month);
  const [prev, tasks] = await Promise.all([
    db.performanceReport.findFirst({ where: { userId: user.id, month: { lt: month } }, orderBy: { month: "desc" } }),
    db.task.findMany({
      where: { assigneeId: user.id, OR: [{ completedAt: { gte: fromIso(first), lt: fromIso(addDays(last, 1)) } }, { status: { in: ["DOING", "REVIEW"] } }] },
      orderBy: { id: "asc" },
    }),
  ]);
  const groups = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const name = ((t.fields as Record<string, string>).project || t.title).trim();
    groups.set(name, [...(groups.get(name) ?? []), t]);
  }
  const prevData = prev?.data as ReportData | undefined;
  const data: ReportData = {
    summary: "",
    responsibilities: prevData?.responsibilities ?? reportTemplate(user.department?.name).responsibilities,
    achievements: [],
    projects: [...groups].map(([name, ts]) => ({
      name,
      status: ts.every((t) => t.status === "DONE") ? "Completed" : ts.some((t) => t.status === "REVIEW") ? "In Testing" : "In Progress",
      outcome: ts.length > 1 || ts[0].title !== name ? ts.map((t) => t.title).join("; ") : "",
    })),
    challenges: "",
    support: "",
    learning: [],
    highlights: [],
    selfAssessment: "",
    objectives: [],
  };
  return { designation: prev?.designation ?? "", data };
}

export const reportData = (r: PerformanceReport) => r.data as ReportData;

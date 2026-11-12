import { db } from "./db";
import { fromIso } from "./leave";
import { addDays, addMonths } from "./leave-days";
import { usageReport } from "./reports";

/** Per-team numbers for the dashboard "Teams overview" and the analytics page. */
export async function teamsOverview(today: string) {
  const month = today.slice(0, 7);
  const monthEnd = addDays(addMonths(`${month}-01`, 1), -1);
  const day = fromIso(today);
  const [departments, open, overdue, done30, outToday, usage] = await Promise.all([
    db.department.findMany({
      orderBy: { name: "asc" },
      include: { users: { where: { isActive: true }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } } },
    }),
    db.task.groupBy({ by: ["departmentId"], where: { status: { not: "DONE" } }, _count: true }),
    db.task.groupBy({ by: ["departmentId"], where: { status: { not: "DONE" }, dueDate: { lt: day } }, _count: true }),
    db.task.groupBy({ by: ["departmentId"], where: { status: "DONE", completedAt: { gte: fromIso(addDays(today, -30)) } }, _count: true }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } },
      select: { user: { select: { departmentId: true, name: true } } },
    }),
    usageReport({ from: `${month}-01`, to: monthEnd }),
  ]);
  const count = (rows: { departmentId: number | null; _count: number }[], id: number) => rows.find((r) => r.departmentId === id)?._count ?? 0;

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    lead: d.users.find((u) => u.role === "LEAD")?.name ?? "—",
    members: d.users.length,
    open: count(open, d.id),
    overdue: count(overdue, d.id),
    done30: count(done30, d.id),
    out: outToday.filter((l) => l.user.departmentId === d.id).length,
    leaveDays: usage.rows.filter((r) => r.department === d.name).reduce((s, r) => s + r.total, 0),
  }));
}

/** Width for a bar as a share of the largest value. */
export const pct = (n: number, max: number) => `${max > 0 ? Math.round((n / max) * 100) : 0}%`;

export function greeting(timezone: string, first: string) {
  const hour = Number(new Date().toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: timezone }));
  return `${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${first}`;
}

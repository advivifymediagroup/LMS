import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, getSetting, todayIso } from "@/lib/leave";
import { addDays, addMonths, datesBetween, dayOfWeek, toIso } from "@/lib/leave-days";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const user = await requireUser();
  const q = await searchParams;
  const today = await todayIso();
  const month = /^\d{4}-\d{2}$/.test(String(q.month)) ? String(q.month) : today.slice(0, 7);
  const first = `${month}-01`;
  const last = addDays(addMonths(first, 1), -1);

  // Admins see everyone (or one department). Others see their own department, or just themselves and their reports.
  const departments = user.role === "ADMIN" ? await db.department.findMany({ orderBy: { name: "asc" } }) : [];
  const deptId = user.role === "ADMIN" ? Number(q.dept) || undefined : user.departmentId ?? undefined;
  const who: Prisma.UserWhereInput =
    deptId ? { departmentId: deptId } : user.role === "ADMIN" ? {} : { OR: [{ id: user.id }, { managerId: user.id }] };

  const [leaves, holidays, workingDays] = await Promise.all([
    db.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: fromIso(last) }, endDate: { gte: fromIso(first) }, user: who },
      include: { user: true, leaveType: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.holiday.findMany({ where: { date: { gte: fromIso(first), lte: fromIso(last) } } }),
    getSetting<number[]>("workingDays", [1, 2, 3, 4, 5]),
  ]);

  const holidayOn = new Map(holidays.map((h) => [toIso(h.date), h]));
  const leavesOn = new Map<string, typeof leaves>();
  for (const l of leaves) {
    const s = toIso(l.startDate), e = toIso(l.endDate);
    for (const d of datesBetween(s < first ? first : s, e > last ? last : e)) {
      if (!workingDays.includes(dayOfWeek(d)) || (holidayOn.has(d) && !holidayOn.get(d)!.isOptional)) continue;
      leavesOn.set(d, [...(leavesOn.get(d) ?? []), l]);
    }
  }

  // Grid starts on the Monday on or before the 1st and ends on the Sunday on or after the last day.
  const gridStart = addDays(first, -((dayOfWeek(first) + 6) % 7));
  const gridEnd = addDays(last, (7 - dayOfWeek(last)) % 7);
  const title = new Date(first + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const link = (m: string) => `/calendar?month=${m}${user.role === "ADMIN" && deptId ? `&dept=${deptId}` : ""}`;
  const half = (l: (typeof leaves)[number], d: string) =>
    (d === toIso(l.startDate) && l.startHalf !== "FULL") || (d === toIso(l.endDate) && l.endHalf !== "FULL") ? " ½" : "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="h1 mb-0 mr-auto">Leave calendar · {title}</h1>
        <Link className="btn" href={link(addMonths(first, -1).slice(0, 7))}>← Prev</Link>
        <Link className="btn" href={link(today.slice(0, 7))}>Today</Link>
        <Link className="btn" href={link(addMonths(first, 1).slice(0, 7))}>Next →</Link>
      </div>
      {user.role === "ADMIN" && (
        <form className="flex items-end gap-2">
          <input type="hidden" name="month" value={month} />
          <div>
            <label className="label" htmlFor="dept">Department</label>
            <select className="input" id="dept" name="dept" defaultValue={deptId ?? ""}>
              <option value="">Everyone</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <button className="btn btn-primary">Show</button>
        </form>
      )}
      <p className="text-sm text-gray-600">
        Solid = approved, dashed = pending. <span className="rounded bg-red-50 px-1">Red</span> = office holiday,{" "}
        <span className="rounded bg-amber-50 px-1">amber</span> = optional holiday.
      </p>
      <div className="overflow-x-auto">
        <div className="grid min-w-[700px] grid-cols-7 border-l border-t border-gray-200 bg-white text-xs">
          {WEEKDAYS.map((w) => <div key={w} className="border-b border-r border-gray-200 bg-gray-50 p-1 font-medium">{w}</div>)}
          {datesBetween(gridStart, gridEnd).map((d) => {
            const h = holidayOn.get(d);
            const off = !workingDays.includes(dayOfWeek(d));
            const bg = h ? (h.isOptional ? "bg-amber-50" : "bg-red-50") : off ? "bg-gray-50" : "";
            return (
              <div key={d} className={`min-h-24 border-b border-r border-gray-200 p-1 ${bg} ${d.slice(0, 7) !== month ? "opacity-40" : ""}`}>
                <div className={`mb-1 ${d === today ? "font-bold text-blue-600" : "text-gray-500"}`}>{Number(d.slice(8))}</div>
                {h && <div className="mb-1 text-gray-700">{h.name}</div>}
                {d.slice(0, 7) === month && leavesOn.get(d)?.map((l) => {
                  const props = {
                    title: `${l.user.name}: ${l.leaveType.name} (${l.status.toLowerCase()})`,
                    className: `mb-0.5 block truncate rounded border px-1 ${l.status === "PENDING" ? "border-dashed border-gray-400" : "border-blue-200 bg-blue-50"}`,
                    children: `${l.user.name} · ${l.leaveType.code}${half(l, d)}`,
                  };
                  // Same rule as the detail page: applicant, their manager, admins.
                  const canOpen = user.role === "ADMIN" || l.userId === user.id || l.user.managerId === user.id;
                  return canOpen ? <Link key={l.id} href={`/leaves/${l.id}`} {...props} /> : <span key={l.id} {...props} />;
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

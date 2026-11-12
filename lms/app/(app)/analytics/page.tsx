import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, todayIso } from "@/lib/leave";
import { addDays, toIso } from "@/lib/leave-days";
import { pct, teamsOverview } from "@/lib/portal";
import { StatCard } from "../ui";

export default async function AnalyticsPage() {
  await requireUser(["LEAD", "ADMIN"]);
  const today = await todayIso();
  const d30 = fromIso(addDays(today, -30)), d60 = fromIso(addDays(today, -60));
  const [teams, done30, donePrev, people] = await Promise.all([
    teamsOverview(today),
    db.task.findMany({ where: { status: "DONE", completedAt: { gte: d30 } }, select: { dueDate: true, completedAt: true } }),
    db.task.count({ where: { status: "DONE", completedAt: { gte: d60, lt: d30 } } }),
    db.user.count({ where: { isActive: true } }),
  ]);
  const withDue = done30.filter((t) => t.dueDate);
  // On time = finished on or before its due date (compared as calendar days).
  const onTime = withDue.filter((t) => toIso(t.completedAt!) <= toIso(t.dueDate!)).length;
  const leaveDays = teams.reduce((s, t) => s + t.leaveDays, 0);
  const outToday = teams.reduce((s, t) => s + t.out, 0);
  const change = donePrev ? Math.round(((done30.length - donePrev) / donePrev) * 100) : null;
  const month = new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  const maxDone = Math.max(0, ...teams.map((t) => t.done30));
  const maxLeave = Math.max(0, ...teams.map((t) => t.leaveDays));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        <StatCard label="Tasks completed · 30d" value={done30.length} note={change === null ? "No earlier data" : `${change >= 0 ? "+" : ""}${change}% vs previous 30 days`} />
        <StatCard label="On-time rate" value={withDue.length ? `${Math.round((onTime / withDue.length) * 100)}%` : "—"} note={`${onTime} of ${withDue.length} tasks with a due date`} warn={withDue.length > 0 && onTime / withDue.length < 0.9} />
        <StatCard label={`Leave days · ${month}`} value={leaveDays} note={people ? `${(leaveDays / people).toFixed(1)} days per person` : undefined} href="/admin/reports" />
        <StatCard label="On leave today" value={outToday} note={teams.filter((t) => t.out).map((t) => `${t.name} ${t.out}`).join(" · ") || "Everyone is in"} />
      </div>

      {teams.length === 0 ? (
        <p className="card text-sm text-gray-500">No teams yet. Add them under Admin → Teams.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-stretch gap-4">
          <section className="card flex flex-col gap-[18px]">
            <div className="flex items-baseline justify-between">
              <h2 className="card-title">Tasks completed by team</h2>
              <span className="eyebrow">Last 30 days</span>
            </div>
            <div className="flex h-[260px] items-end gap-[18px] border-b border-gray-300 px-1.5">
              {teams.map((t, i) => (
                <div key={t.id} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="font-mono text-xs font-semibold">{t.done30}</span>
                  <div className={`w-full max-w-14 rounded-t-md ${i === teams.findIndex((x) => x.done30 === maxDone) && maxDone ? "bg-brand-500" : "bg-char"}`} style={{ height: `calc(${pct(t.done30, maxDone)} * .88)` }} />
                </div>
              ))}
            </div>
            <div className="-mt-2 flex gap-[18px] px-1.5">
              {teams.map((t) => <Link key={t.id} href={`/tasks/board?team=${t.id}`} className="flex-1 truncate text-center text-xs font-semibold text-gray-700 hover:text-brand-600">{t.name}</Link>)}
            </div>
          </section>

          <section className="card flex flex-col gap-4">
            <div className="flex items-baseline justify-between">
              <h2 className="card-title">Leave days taken</h2>
              <span className="eyebrow">{month}</span>
            </div>
            {teams.map((t) => (
              <div key={t.id} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[13.5px]">
                  <span className="font-bold">{t.name}</span>
                  <span className="font-mono font-semibold">{t.leaveDays}d <span className="font-normal text-gray-500">· {t.out} out today</span></span>
                </div>
                <div className="h-2 overflow-hidden rounded bg-gray-100">
                  <div className={`h-full rounded ${t.leaveDays === maxLeave && maxLeave > 0 ? "bg-brand-500" : "bg-char"}`} style={{ width: pct(t.leaveDays, maxLeave) }} />
                </div>
              </div>
            ))}
            <p className="pt-1 text-[12.5px] text-gray-600">Orange marks the team with the most leave this month. Check coverage before approving more.</p>
          </section>
        </div>
      )}
    </div>
  );
}

export const metadata = { title: "Analytics" };

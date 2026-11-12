import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, getBalances, getSetting, probationEnd, todayIso } from "@/lib/leave";
import { addDays, toIso } from "@/lib/leave-days";
import { greeting, pct, teamsOverview } from "@/lib/portal";
import { dueGroup, dueLabel, shortDate } from "@/lib/task-rules";
import { LeaveDecision } from "../leave/decision";
import { dateRange } from "../leaves/leave-table";
import { Avatar, PriorityPill, StatCard, TaskCheck, TypeDot } from "../ui";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const today = await todayIso();
  const day = fromIso(today);
  const weekEnd = fromIso(addDays(today, 7));
  const approverScope = user.role === "ADMIN" ? { userId: { not: user.id } } : { user: { managerId: user.id } };
  const isApprover = user.role !== "EMPLOYEE";

  const [tz, tasks, balances, myPending, nextLeave, approvals, probation, manager] = await Promise.all([
    getSetting("timezone", "Asia/Kolkata"),
    db.task.findMany({
      where: { assigneeId: user.id, status: { not: "DONE" } },
      include: { department: true },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    }),
    getBalances(user.id),
    db.leaveRequest.findMany({ where: { userId: user.id, status: "PENDING" }, include: { leaveType: true }, orderBy: { startDate: "asc" } }),
    db.leaveRequest.findFirst({ where: { userId: user.id, status: "APPROVED", endDate: { gte: day } }, include: { leaveType: true }, orderBy: { startDate: "asc" } }),
    isApprover
      ? db.leaveRequest.findMany({ where: { ...approverScope, status: "PENDING" }, include: { leaveType: true, user: true }, orderBy: { createdAt: "asc" } })
      : [],
    probationEnd(user),
    user.managerId ? db.user.findUnique({ where: { id: user.managerId } }) : null,
  ]);
  const onProbation = user.role === "EMPLOYEE" && today < probation;
  const dueToday = tasks.filter((t) => t.dueDate && toIso(t.dueDate) <= today).length;
  const overdue = tasks.filter((t) => t.dueDate && toIso(t.dueDate) < today).length;
  const dueWeek = tasks.filter((t) => t.dueDate && t.dueDate <= weekEnd).length;
  const paid = balances.filter((b) => b.type.needsBalance);
  const first = user.name.split(" ")[0];

  // Onboarding checklist: a new hire's tasks of kind "Onboarding".
  const onboarding = onProbation
    ? await db.task.findMany({ where: { assigneeId: user.id, kind: "Onboarding" }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { id: "asc" }] })
    : [];
  const onbDone = onboarding.filter((t) => t.status === "DONE").length;
  const onbPct = onboarding.length ? Math.round((onbDone / onboarding.length) * 100) : 0;

  const teams = isApprover ? await teamsOverview(today) : [];
  const myTeam = teams.find((t) => t.id === user.departmentId);

  let sub: string, stats: React.ComponentProps<typeof StatCard>[], cta: [string, string][];
  if (user.role === "ADMIN") {
    const [people, outToday, openAll, overdueAll] = await Promise.all([
      db.user.count({ where: { isActive: true } }),
      db.leaveRequest.count({ where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } } }),
      db.task.count({ where: { status: { not: "DONE" } } }),
      db.task.count({ where: { status: { not: "DONE" }, dueDate: { lt: day } } }),
    ]);
    sub = `${plural(people, "active user")} across ${plural(teams.length, "team")}. ${plural(approvals.length, "leave request")} waiting for you.`;
    stats = [
      { label: "Active users", value: people, note: `${teams.length} teams`, href: "/admin/users" },
      { label: "On leave today", value: outToday, note: `${people ? ((outToday / people) * 100).toFixed(1) : 0}% of staff` },
      { label: "Pending leave", value: approvals.length, note: approvals[0] ? `Oldest from ${shortDate(toIso(approvals[0].createdAt))}` : "All clear", warn: approvals.length > 0, href: "/leave" },
      { label: "Open tasks", value: openAll, note: `${overdueAll} overdue`, warn: overdueAll > 0, href: "/tasks/board" },
    ];
    cta = [["/leave", "Leave overview"], ["/admin/users/new", "Add user"]];
  } else if (user.role === "LEAD") {
    const t = myTeam;
    sub = t
      ? `${t.name} has ${plural(t.open, "open task")}, ${t.overdue} overdue. ${t.out} out today.`
      : `${plural(approvals.length, "leave request")} waiting for you.`;
    stats = [
      { label: "Team open tasks", value: t?.open ?? 0, note: t ? `${t.done30} done in 30 days` : undefined, href: t ? `/tasks/board?team=${t.id}` : "/tasks/board" },
      { label: "Overdue", value: t?.overdue ?? 0, note: t?.overdue ? "Needs attention" : "On track", warn: !!t?.overdue },
      { label: "Out today", value: t?.out ?? 0, note: t ? `of ${t.members} in ${t.name}` : undefined },
      { label: "Leave approvals", value: approvals.length, note: approvals[0] ? `Oldest from ${shortDate(toIso(approvals[0].createdAt))}` : "All clear", warn: approvals.length > 0, href: "/leave" },
    ];
    cta = [["/leave", "Review leave"], ["/tasks/new", "Assign task"]];
  } else {
    const pendingNote = myPending[0] ? ` Your ${dateRange(myPending[0])} leave is waiting for approval.` : "";
    sub = onProbation
      ? `Welcome to Advivify. Probation ends ${shortDate(probation)}.${pendingNote}`
      : `You have ${plural(dueWeek, "task")} due this week.${pendingNote}`;
    const main = paid[0];
    stats = [
      onProbation && onboarding.length
        ? { label: "Onboarding", value: `${onbPct}%`, note: `${onbDone} of ${onboarding.length} steps` }
        : { label: "Open tasks", value: tasks.length, note: `${dueToday} due today`, warn: dueToday > 0, href: "/tasks" },
      { label: "Due this week", value: dueWeek, note: `${overdue} overdue`, warn: overdue > 0, href: "/tasks" },
      main
        ? { label: `${main.type.name} left`, value: `${main.available}d`, note: main.pending ? `${main.pending}d pending` : "Available now", href: "/leave" }
        : { label: "Leave", value: "—" },
      { label: "Pending requests", value: myPending.length, note: myPending[0] ? `Sent ${shortDate(toIso(myPending[0].createdAt))}` : "None waiting", href: "/leaves?status=PENDING" },
    ];
    cta = [["/tasks/board", "Team board"], ["/leave#apply", "Request leave"]];
  }

  // Recent team activity for employees: finished tasks and approved leave in their team.
  const activity = user.role === "EMPLOYEE" && user.departmentId ? await teamActivity(user.departmentId) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[30px] font-extrabold tracking-[-0.03em]">{greeting(tz, first)}</h1>
          <p className="text-[15px] text-gray-600">{sub}</p>
        </div>
        <div className="flex gap-2.5">
          <Link className="btn" href={cta[0][0]}>{cta[0][1]}</Link>
          <Link className="btn btn-primary" href={cta[1][0]}>{cta[1][1]}</Link>
        </div>
      </div>
      {typeof error === "string" && <p className="error">{error}</p>}

      {onboarding.length > 0 && (
        <div className="grid gap-8 rounded-2xl bg-char p-7 text-paper md:grid-cols-[1fr_1.4fr]">
          <div className="flex flex-col gap-3.5">
            <div className="font-mono text-[11px] font-medium tracking-[.12em] text-brand-400 uppercase">Onboarding · probation ends {shortDate(probation)}</div>
            <div className="text-2xl leading-tight font-extrabold tracking-[-0.02em]">
              You&apos;re {onbPct}% through onboarding.
            </div>
            <div className="h-2 overflow-hidden rounded bg-white/[.12]"><div className="h-full rounded bg-brand-500" style={{ width: `${onbPct}%` }} /></div>
            {manager && <div className="text-[13px] text-[#c4c7cc]">Manager and leave approver: {manager.name}</div>}
          </div>
          <div className="flex flex-col gap-0.5">
            {onboarding.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5">
                <TaskCheck id={t.id} done={t.status === "DONE"} />
                <Link href={`/tasks/${t.id}`} className={`flex-1 text-sm font-semibold ${t.status === "DONE" ? "text-[#8d9096] line-through" : "text-paper"}`}>{t.title}</Link>
                <span className="font-mono text-[11.5px] text-[#a9acb2]">{dueLabel(t.dueDate && toIso(t.dueDate), today)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(380px,100%),1fr))] items-start gap-4">
        <section className="card flex flex-col gap-1.5">
          <div className="flex items-center justify-between pb-2">
            <h2 className="card-title">Due soon</h2>
            <Link className="link text-[13px]" href="/tasks">All my tasks</Link>
          </div>
          {!tasks.length && <p className="border-t border-[#f0ece6] py-3 text-sm text-gray-500">No open tasks assigned to you.</p>}
          {tasks.slice(0, 4).map((t) => {
            const due = t.dueDate && toIso(t.dueDate);
            const urgent = ["Overdue", "Today"].includes(dueGroup(due, today));
            return (
              <div key={t.id} className="flex items-center gap-3.5 border-t border-[#f0ece6] py-3">
                <TaskCheck id={t.id} done={false} />
                <Link href={`/tasks/${t.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold">{t.title}</span>
                  <span className="text-xs text-gray-500">{t.department?.name ?? "No team"} · {t.kind}</span>
                </Link>
                <PriorityPill p={t.priority} />
                <span className={`w-16 text-right font-mono text-xs font-medium ${urgent ? "text-brand-700" : "text-gray-600"}`}>{dueLabel(due, today)}</span>
              </div>
            );
          })}
        </section>

        {isApprover ? (
          <section className="card flex flex-col gap-1.5">
            <div className="flex items-center justify-between pb-2">
              <h2 className="card-title">Leave requests</h2>
              <Link className="link text-[13px]" href="/leave">Open leave</Link>
            </div>
            {!approvals.length && <p className="border-t border-[#f0ece6] py-3 text-sm text-gray-500">Nothing waiting for your approval.</p>}
            {approvals.slice(0, 3).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2.5 border-t border-[#f0ece6] py-3">
                <Avatar name={a.user.name} />
                <Link href={`/leaves/${a.id}`} className="flex min-w-0 flex-[1_1_160px] flex-col gap-0.5">
                  <span className="text-sm font-bold">{a.user.name}</span>
                  <span className="text-xs text-gray-500">{a.leaveType.name} · {dateRange(a)} · {Number(a.days)}d</span>
                </Link>
                <LeaveDecision id={a.id} back="/dashboard" />
              </div>
            ))}
          </section>
        ) : (
          <section className="card flex flex-col gap-1.5">
            <div className="flex items-center justify-between pb-2">
              <h2 className="card-title">Leave balance</h2>
              <Link className="link text-[13px]" href="/leave#apply">Request leave</Link>
            </div>
            {paid.map((b) => {
              const cap = Math.max(b.available, Number(b.type.yearlyQuota) || Number(b.type.monthlyCredit) * 12 || 1);
              return (
                <div key={b.type.id} className="flex flex-col gap-2 border-t border-[#f0ece6] py-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-bold"><TypeDot code={b.type.code} />{b.type.name}</span>
                    <span className="font-mono text-xs text-gray-600"><span className="text-[15px] font-semibold text-ink">{b.available}</span> days left{b.pending ? ` · ${b.pending} pending` : ""}</span>
                  </div>
                  <div className="bar"><div style={{ width: pct(b.available, cap) }} /></div>
                </div>
              );
            })}
            <div className="mt-1.5 flex items-center gap-2.5 rounded-[10px] bg-brand-50 px-3.5 py-3 text-[13px] text-brand-900">
              <span className="size-[7px] flex-none rounded-full bg-brand-500" />
              <span>
                {myPending[0]
                  ? `${dateRange(myPending[0])} ${myPending[0].leaveType.name.toLowerCase()} is pending${manager ? ` with ${manager.name}` : ""}.`
                  : nextLeave
                    ? `Next leave: ${nextLeave.leaveType.name}, ${dateRange(nextLeave)}.`
                    : "No upcoming leave booked."}
              </span>
            </div>
          </section>
        )}
      </div>

      {isApprover && teams.length > 0 && (
        <section className="card pb-2">
          <div className="flex items-center justify-between pb-3.5">
            <h2 className="card-title">Teams overview</h2>
            <Link className="link text-[13px]" href="/analytics">Open analytics</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table min-w-[820px]">
              <thead>
                <tr><th>Team</th><th>Lead</th><th>People</th><th>Open</th><th>Overdue</th><th>Out today</th><th>Leave days · {new Date(today + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })}</th></tr>
              </thead>
              <tbody>
                {teams.map((t) => {
                  const max = Math.max(...teams.map((x) => x.leaveDays));
                  return (
                    <tr key={t.id}>
                      <td className="font-bold"><Link href={`/tasks/board?team=${t.id}`} className="hover:text-brand-600">{t.name}</Link></td>
                      <td className="text-gray-700">{t.lead}</td>
                      <td className="font-mono">{t.members}</td>
                      <td className="font-mono">{t.open}</td>
                      <td className={`font-mono ${t.overdue ? "font-bold text-brand-700" : ""}`}>{t.overdue}</td>
                      <td className="font-mono">{t.out}</td>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="bar flex-1"><div className={t.leaveDays === max && max > 0 ? "bg-brand-500" : ""} style={{ width: pct(t.leaveDays, max) }} /></div>
                          <span className="w-8 text-right font-mono text-xs">{t.leaveDays}</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activity.length > 0 && (
        <section className="card flex flex-col gap-1">
          <h2 className="card-title pb-2.5">Team activity</h2>
          {activity.map((a, i) => (
            <div key={i} className="flex items-center gap-3 border-t border-[#f0ece6] py-2.5 text-sm">
              <Avatar name={a.name} className="size-7 text-[10.5px]" />
              <div className="flex-1 text-gray-700"><span className="font-bold text-ink">{a.name}</span> {a.text}</div>
              <div className="font-mono text-xs text-gray-500">{shortDate(toIso(a.at))}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

async function teamActivity(departmentId: number) {
  const since = new Date(Date.now() - 14 * 86400_000);
  const [done, leave] = await Promise.all([
    db.task.findMany({ where: { departmentId, status: "DONE", completedAt: { gte: since } }, include: { assignee: true, createdBy: true }, orderBy: { completedAt: "desc" }, take: 5 }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", decidedAt: { gte: since }, user: { departmentId } }, include: { user: true, leaveType: true }, orderBy: { decidedAt: "desc" }, take: 5 }),
  ]);
  return [
    ...done.map((t) => ({ name: (t.assignee ?? t.createdBy).name, text: `finished ${t.title}`, at: t.completedAt! })),
    ...leave.map((l) => ({ name: l.user.name, text: `is off for ${l.leaveType.name.toLowerCase()}, ${dateRange(l)}`, at: l.decidedAt! })),
  ].sort((a, b) => +b.at - +a.at).slice(0, 5);
}

export const metadata = { title: "Dashboard" };

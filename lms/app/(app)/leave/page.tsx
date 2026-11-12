import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, getBalances, getSetting, todayIso } from "@/lib/leave";
import { addDays, datesBetween, dayOfWeek, toIso } from "@/lib/leave-days";
import { pct } from "@/lib/portal";
import { shortDate } from "@/lib/task-rules";
import { ApplyForm } from "../leaves/apply/apply-form";
import { StatusBadge, dateRange } from "../leaves/leave-table";
import { Avatar, TypeDot, typeColor } from "../ui";
import { LeaveDecision } from "./decision";

const DAYS = 10; // working days shown in "Who's out"

/** One line about how a leave type is credited, from its settings. */
function typeNote(t: { monthlyCredit: unknown; yearlyQuota: unknown; maxCarryForward: unknown; needsBalance: boolean; optionalHolidayOnly: boolean }) {
  if (!t.needsBalance) return "Unpaid · no balance needed";
  const parts = [Number(t.monthlyCredit) ? `${Number(t.monthlyCredit)} day a month` : `${Number(t.yearlyQuota)} days a year`];
  parts.push(t.maxCarryForward === null ? "never expires" : Number(t.maxCarryForward) ? `${Number(t.maxCarryForward)} carry over` : "lapses Dec 31");
  if (t.optionalHolidayOnly) parts.push("optional holidays only");
  return parts.join(" · ");
}

export default async function LeavePage({ searchParams }: PageProps<"/leave">) {
  const user = await requireUser();
  const { error } = await searchParams;
  const today = await todayIso();
  const isApprover = user.role !== "EMPLOYEE";
  const scope = user.role === "ADMIN" ? { userId: { not: user.id } } : { user: { managerId: user.id } };

  // The next working days for "Who's out".
  const workingDays = await getSetting<number[]>("workingDays", [1, 2, 3, 4, 5]);
  const window = datesBetween(today, addDays(today, 30)).filter((d) => workingDays.includes(dayOfWeek(d))).slice(0, DAYS);
  const last = window[window.length - 1] ?? today;
  // Teammates for employees and leads; admins see everyone with leave in the window.
  const people: Prisma.UserWhereInput = user.departmentId && user.role !== "ADMIN" ? { departmentId: user.departmentId, isActive: true } : { isActive: true };

  const [approvals, balances, history, out, members, dept, manager] = await Promise.all([
    isApprover ? db.leaveRequest.findMany({ where: { ...scope, status: "PENDING" }, include: { leaveType: true, user: { include: { department: true } } }, orderBy: { startDate: "asc" } }) : [],
    getBalances(user.id),
    db.leaveRequest.findMany({ where: { userId: user.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, startDate: { lte: fromIso(last) }, endDate: { gte: fromIso(today) }, user: people },
      include: { leaveType: true, user: true },
    }),
    user.departmentId && user.role !== "ADMIN" ? db.user.findMany({ where: people, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
    user.departmentId ? db.department.findUnique({ where: { id: user.departmentId } }) : null,
    user.managerId ? db.user.findUnique({ where: { id: user.managerId } }) : null,
  ]);

  const rows = (members.length ? members : [...new Map(out.map((l) => [l.user.id, { id: l.user.id, name: l.user.name }])).values()].sort((a, b) => a.name.localeCompare(b.name)))
    .map((p) => ({
      ...p,
      cells: window.map((d) => out.find((l) => l.userId === p.id && toIso(l.startDate) <= d && toIso(l.endDate) >= d)),
    }));
  const types = balances.map((b) => ({ id: b.type.id, name: b.type.name, allowHalfDay: b.type.allowHalfDay, hint: b.type.needsBalance ? `${b.available} day(s) available` : "Unpaid" }));
  const calTitle = user.role === "ADMIN" || !dept ? "All teams" : dept.name;

  return (
    <div className="flex flex-col gap-5">
      {typeof error === "string" && <p className="error">{error}</p>}

      {isApprover && (
        <section className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-[18px]">
            <div className="flex items-baseline gap-2.5">
              <h2 className="card-title">Awaiting your approval</h2>
              <span className="font-mono text-xs font-semibold text-brand-700">{approvals.length} pending</span>
            </div>
            <div className="flex items-center gap-4 text-[12.5px] text-gray-600">
              {user.role === "ADMIN" ? "All employees" : "Your direct reports"}
              <Link className="link" href="/approvals">Recently decided</Link>
            </div>
          </div>
          {approvals.length === 0 ? (
            <p className="border-t border-gray-200 px-5 py-4 text-sm text-gray-500">Nothing waiting for you.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table min-w-[960px]">
                <thead><tr><th>Employee</th><th>Type</th><th>Dates</th><th>Days</th><th>Reason</th><th /></tr></thead>
                <tbody>
                  {approvals.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={a.user.name} />
                          <div className="flex flex-col"><Link href={`/leaves/${a.id}`} className="font-bold hover:text-brand-600">{a.user.name}</Link><span className="text-xs text-gray-500">{a.user.department?.name ?? "—"}</span></div>
                        </div>
                      </td>
                      <td><span className="flex items-center gap-2"><TypeDot code={a.leaveType.code} />{a.leaveType.name}</span></td>
                      <td className="font-mono text-[12.5px]">{dateRange(a)}</td>
                      <td className="font-mono text-[12.5px]">{Number(a.days)}</td>
                      <td className="max-w-[260px] truncate text-[13px] text-gray-600" title={a.reason}>{a.reason}</td>
                      <td><LeaveDecision id={a.id} back="/leave" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3.5">
        {balances.map((b) => {
          const cap = Math.max(b.available, Number(b.type.yearlyQuota) || Number(b.type.monthlyCredit) * 12 || 1);
          return (
            <div key={b.type.id} className="flex flex-col gap-3 rounded-[14px] border border-gray-200 bg-white p-[18px]">
              <div className="flex items-center gap-2"><TypeDot code={b.type.code} /><span className="text-[12.5px] font-semibold text-gray-600">{b.type.name}</span></div>
              <div className="flex items-baseline gap-1.5">
                <span className="num text-[30px]">{b.type.needsBalance ? b.available : "—"}</span>
                <span className="text-[13px] text-gray-600">{b.type.needsBalance ? `days left${b.pending ? ` · ${b.pending} pending` : ""}` : "on request"}</span>
              </div>
              <div className="bar"><div style={{ width: b.type.needsBalance ? pct(b.available, cap) : "0%" }} /></div>
              <div className="text-xs text-gray-600">{typeNote(b.type)}</div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(360px,100%),1fr))] items-start gap-4">
        <section id="apply" className="flex scroll-mt-24 flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Request leave</h2>
            <span className="text-[12.5px] text-gray-600">Approver: {manager?.name ?? "an admin"}</span>
          </div>
          <ApplyForm types={types} today={today} />
        </section>

        <div className="flex flex-col gap-4">
          <section className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="card-title">Who&apos;s out · {calTitle} · {window[0] && `${shortDate(window[0])}–${shortDate(last)}`}</h2>
              <div className="flex flex-wrap gap-3.5 text-xs text-gray-600">
                {[...new Map(out.map((l) => [l.leaveType.code, l.leaveType.name])).entries()].map(([code, name]) => (
                  <span key={code} className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: typeColor(code) }} />{name}</span>
                ))}
                <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] border border-dashed border-gray-500" />Pending</span>
              </div>
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-500">Nobody is off in the next {DAYS} working days.</p>
            ) : (
              <div className="overflow-x-auto">
                <div className="grid min-w-[470px] gap-1" style={{ gridTemplateColumns: `130px repeat(${window.length}, minmax(28px, 1fr))` }}>
                  <div />
                  {window.map((d) => (
                    <div key={d} className="flex flex-col items-center gap-px pb-1">
                      <span className="font-mono text-[10px] font-medium text-gray-500">{"SMTWTFS"[dayOfWeek(d)]}</span>
                      <span className={`font-mono text-[13px] font-semibold ${d === today ? "text-brand-600" : ""}`}>{Number(d.slice(8))}</span>
                    </div>
                  ))}
                  {rows.map((r) => [
                    <div key={r.id} className="truncate text-[13px] font-semibold">{r.name}</div>,
                    ...r.cells.map((l, i) => (
                      <div
                        key={`${r.id}-${i}`}
                        title={l ? `${l.leaveType.name} (${l.status.toLowerCase()})` : undefined}
                        className={`h-[26px] rounded-[5px] ${!l ? "border border-gray-100 bg-paper" : l.status === "PENDING" ? "border-[1.5px] border-dashed" : ""}`}
                        style={l ? (l.status === "PENDING" ? { borderColor: typeColor(l.leaveType.code) } : { background: typeColor(l.leaveType.code) }) : undefined}
                      />
                    )),
                  ])}
                </div>
              </div>
            )}
            <Link className="link self-start text-[13px]" href="/calendar">Open month calendar</Link>
          </section>

          <section className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
            <div className="flex items-center justify-between px-5 py-[18px]">
              <h2 className="card-title">My requests</h2>
              <Link className="link text-[13px]" href="/leaves">Full history</Link>
            </div>
            {history.length === 0 && <p className="border-t border-[#f0ece6] px-5 py-3 text-sm text-gray-500">You haven&apos;t requested leave yet.</p>}
            {history.map((h) => (
              <Link key={h.id} href={`/leaves/${h.id}`} className="grid grid-cols-[1fr_1.3fr_.6fr_110px] items-center gap-3.5 border-t border-[#f0ece6] px-5 py-3 text-sm hover:bg-gray-50">
                <span className="flex items-center gap-2 font-bold"><TypeDot code={h.leaveType.code} />{h.leaveType.name}</span>
                <span className="font-mono text-[12.5px]">{dateRange(h)}</span>
                <span className="font-mono text-[12.5px] text-gray-600">{Number(h.days)}d</span>
                <span className="text-right"><StatusBadge status={h.status} /></span>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "Leave" };

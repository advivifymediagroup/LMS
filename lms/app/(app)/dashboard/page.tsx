import Link from "next/link";
import type { User } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays } from "@/lib/leave-days";
import { fromIso, getBalances, todayIso } from "@/lib/leave";
import { LeaveTable } from "../leaves/leave-table";

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </>
  );
  return href ? <Link href={href} className="card block hover:border-blue-300">{body}</Link> : <div className="card">{body}</div>;
}

const overlaps = (from: Date, to: Date) => ({ startDate: { lte: to }, endDate: { gte: from } });

async function EmployeeSection({ user, today }: { user: User; today: Date }) {
  const [balances, upcoming, recent] = await Promise.all([
    getBalances(user.id),
    db.leaveRequest.findMany({
      where: { userId: user.id, status: { in: ["APPROVED", "PENDING"] }, endDate: { gte: today } },
      include: { leaveType: true },
      orderBy: { startDate: "asc" },
    }),
    db.leaveRequest.findMany({ where: { userId: user.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 5 }),
  ]);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {balances.filter((b) => b.type.needsBalance).map((b) => (
          <div key={b.type.id} className="card">
            <div className="text-sm text-gray-600">{b.type.name}</div>
            <div className="text-2xl font-semibold">{b.available}</div>
            <div className="text-xs text-gray-500">available{b.pending ? ` · ${b.pending} pending` : ""}</div>
          </div>
        ))}
      </div>
      <section>
        <h2 className="mb-2 font-medium">My upcoming leave</h2>
        <LeaveTable rows={upcoming} />
      </section>
      <section>
        <h2 className="mb-2 font-medium">My recent applications</h2>
        <LeaveTable rows={recent} />
      </section>
    </>
  );
}

async function LeadSection({ user, today }: { user: User; today: Date }) {
  const team = { managerId: user.id, isActive: true };
  const [pending, outToday, next30, teamSize] = await Promise.all([
    db.leaveRequest.findMany({ where: { status: "PENDING", user: team }, include: { leaveType: true, user: true }, orderBy: { startDate: "asc" } }),
    db.leaveRequest.count({ where: { status: "APPROVED", user: team, ...overlaps(today, today) } }),
    db.leaveRequest.findMany({
      where: { status: { in: ["APPROVED", "PENDING"] }, user: team, ...overlaps(today, fromIso(addDays(today.toISOString().slice(0, 10), 30))) },
      include: { leaveType: true, user: true },
      orderBy: { startDate: "asc" },
    }),
    db.user.count({ where: team }),
  ]);
  return (
    <>
      <h2 className="text-lg font-semibold">My team</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Waiting for my approval" value={pending.length} href="/approvals" />
        <Stat label="Out today" value={`${outToday} of ${teamSize}`} />
        <Stat label="Leaves in the next 30 days" value={next30.length} />
      </div>
      <section>
        <h2 className="mb-2 font-medium">Team leave, next 30 days</h2>
        <LeaveTable rows={next30} showUser />
      </section>
    </>
  );
}

async function AdminSection({ today }: { today: Date }) {
  const year = today.toISOString().slice(0, 4);
  const [employees, outToday, pending, taken, types, departments] = await Promise.all([
    db.user.count({ where: { isActive: true } }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", ...overlaps(today, today) }, include: { leaveType: true, user: true } }),
    db.leaveRequest.count({ where: { status: "PENDING" } }),
    db.leaveRequest.findMany({
      where: { status: "APPROVED", startDate: { gte: fromIso(`${year}-01-01`), lte: fromIso(`${year}-12-31`) } },
      select: { days: true, leaveTypeId: true, user: { select: { departmentId: true } } },
    }),
    db.leaveType.findMany({ where: { isActive: true }, orderBy: { id: "asc" } }),
    db.department.findMany({ orderBy: { name: "asc" } }),
  ]);
  const sum = (f: (t: (typeof taken)[number]) => boolean) => taken.filter(f).reduce((s, t) => s + Number(t.days), 0);
  const rows = [...departments.map((d) => ({ id: d.id as number | null, name: d.name })), { id: null, name: "No department" }];

  return (
    <>
      <h2 className="text-lg font-semibold">Company</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Active employees" value={employees} href="/admin/users" />
        <Stat label="Out today" value={outToday.length} />
        <Stat label="Pending requests" value={pending} href="/approvals" />
        <Stat label={`Leave days taken in ${year}`} value={sum(() => true)} />
      </div>
      {outToday.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium">Out today</h2>
          <LeaveTable rows={outToday} showUser />
        </section>
      )}
      <section>
        <h2 className="mb-2 font-medium">Approved leave days in {year}, by department</h2>
        <div className="card overflow-x-auto p-0">
          <table className="table">
            <thead><tr><th>Department</th>{types.map((t) => <th key={t.id}>{t.code}</th>)}<th>Total</th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.name}>
                  <td>{d.name}</td>
                  {types.map((t) => <td key={t.id}>{sum((x) => x.user.departmentId === d.id && x.leaveTypeId === t.id)}</td>)}
                  <td className="font-medium">{sum((x) => x.user.departmentId === d.id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = fromIso(await todayIso());
  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 className="h1 mb-0 mr-auto">Hi, {user.name.split(" ")[0]}</h1>
        <Link className="btn btn-primary" href="/leaves/apply">Apply for leave</Link>
      </div>
      {user.role === "ADMIN" && <AdminSection today={today} />}
      {user.role !== "EMPLOYEE" && <LeadSection user={user} today={today} />}
      <EmployeeSection user={user} today={today} />
    </div>
  );
}

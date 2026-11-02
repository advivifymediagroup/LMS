import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, getBalances, todayIso } from "@/lib/leave";
import { LeaveTable } from "../leaves/leave-table";

export default async function DashboardPage() {
  const user = await requireUser();
  const today = fromIso(await todayIso());
  const [balances, upcoming, recent, pendingCount] = await Promise.all([
    getBalances(user.id),
    db.leaveRequest.findMany({
      where: { userId: user.id, status: "APPROVED", endDate: { gte: today } },
      include: { leaveType: true },
      orderBy: { startDate: "asc" },
    }),
    db.leaveRequest.findMany({ where: { userId: user.id }, include: { leaveType: true }, orderBy: { createdAt: "desc" }, take: 5 }),
    user.role === "EMPLOYEE"
      ? 0
      : db.leaveRequest.count({
          where: { status: "PENDING", ...(user.role === "ADMIN" ? { userId: { not: user.id } } : { user: { managerId: user.id } }) },
        }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center">
        <h1 className="h1 mb-0 mr-auto">Hi, {user.name.split(" ")[0]}</h1>
        <Link className="btn btn-primary" href="/leaves/apply">Apply for leave</Link>
      </div>
      {pendingCount > 0 && (
        <Link href="/approvals" className="notice block">{pendingCount} leave request(s) waiting for your approval →</Link>
      )}
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
        <h2 className="mb-2 font-medium">Upcoming approved leave</h2>
        <LeaveTable rows={upcoming} />
      </section>
      <section>
        <h2 className="mb-2 font-medium">Recent applications</h2>
        <LeaveTable rows={recent} />
      </section>
    </div>
  );
}

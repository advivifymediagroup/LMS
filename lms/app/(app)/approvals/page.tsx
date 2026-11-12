import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getBalances } from "@/lib/leave";
import { decideLeave } from "../leaves/actions";
import { LeaveTable, dateRange } from "../leaves/leave-table";

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const me = await requireUser(["LEAD", "ADMIN"]);
  const { error } = await searchParams;
  // Leads see their direct reports; admins see everyone. Nobody decides their own.
  const scope = me.role === "ADMIN" ? { userId: { not: me.id } } : { user: { managerId: me.id } };
  const [pending, recent] = await Promise.all([
    db.leaveRequest.findMany({ where: { ...scope, status: "PENDING" }, include: { leaveType: true, user: true }, orderBy: { startDate: "asc" } }),
    db.leaveRequest.findMany({
      where: { ...scope, status: { not: "PENDING" } },
      include: { leaveType: true, user: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const balances = new Map(
    await Promise.all(pending.map(async (l) => [l.id, (await getBalances(l.userId, l.id)).find((b) => b.type.id === l.leaveTypeId)] as const)),
  );

  return (
    <div className="space-y-6">
      <h1 className="h1">Approvals</h1>
      {typeof error === "string" && <p className="error">{error}</p>}
      {!pending.length && <p className="text-sm text-gray-500">Nothing waiting for you.</p>}
      <div className="space-y-3">
        {pending.map((l) => {
          const bal = balances.get(l.id);
          return (
            <div key={l.id} className="card space-y-3">
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="font-medium">{l.user.name}</span>
                <span>{l.leaveType.name}</span>
                <span>{dateRange(l)}</span>
                <span className="font-medium">{Number(l.days)} day(s)</span>
                {bal?.type.needsBalance && <span className="text-sm text-gray-500">{bal.available} available before this</span>}
                <Link className="ml-auto text-sm text-brand-600" href={`/leaves/${l.id}`}>Details</Link>
              </div>
              <p className="text-sm text-gray-700">{l.reason}</p>
              <form action={decideLeave.bind(null, l.id)} className="flex flex-wrap gap-2">
                <input className="input max-w-md flex-1" name="reason" placeholder="Reason (required to reject)" />
                <button className="btn btn-primary hover:cursor-pointer" name="decision" value="APPROVE">Approve</button>
                <button className="btn btn-danger hover:cursor-pointer" name="decision" value="REJECT">Reject</button>
              </form>
            </div>
          );
        })}
      </div>
      <div>
        <h2 className="mb-2 font-medium">Recently decided</h2>
        <LeaveTable rows={recent} showUser />
      </div>
    </div>
  );
}
export const metadata = { title: "Approvals" };

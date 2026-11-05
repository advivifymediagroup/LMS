import { db } from "@/lib/db";
import { getBalances } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";

/** Balance summary + full ledger history for one user. Shared by profile and admin balances. */
export async function BalanceTable({ userId }: { userId: number }) {
  const [balances, ledger] = await Promise.all([
    getBalances(userId),
    db.leaveLedger.findMany({
      where: { userId },
      include: { leaveType: true, createdBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {balances.map((b) => (
          <div key={b.type.id} className="card">
            <div className="text-sm text-gray-600">{b.type.name}</div>
            <div className="text-2xl font-semibold">{b.type.needsBalance ? b.available : "—"}</div>
            <div className="text-xs text-gray-500">
              {b.type.needsBalance ? `available · ${b.balance} balance, ${b.pending} pending` : "unpaid, no balance"}
            </div>
          </div>
        ))}
      </div>
      <div className="card overflow-x-auto p-0">
        <h2 className="px-3 pt-3 font-medium">Balance history</h2>
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Change</th><th>Kind</th><th>Note</th><th>By</th></tr></thead>
          <tbody>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td>{toIso(l.createdAt)}</td>
                <td>{l.leaveType.code}</td>
                <td className={Number(l.days) < 0 ? "text-red-700" : "text-green-700"}>
                  {Number(l.days) > 0 ? "+" : ""}{Number(l.days)}
                </td>
                <td className="capitalize">{l.kind.replace("_", " ").toLowerCase()}</td>
                <td>{l.note ?? (l.leaveRequestId ? `Leave #${l.leaveRequestId}` : "")}</td>
                <td>{l.createdBy?.name ?? "System"}</td>
              </tr>
            ))}
            {!ledger.length && <tr><td colSpan={6} className="text-gray-500">No entries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

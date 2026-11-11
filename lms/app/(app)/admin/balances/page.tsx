import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { BalanceTable } from "../../balance-table";
import { AdjustForm } from "./adjust-form";

export default async function BalancesPage({ searchParams }: PageProps<"/admin/balances">) {
  await requireUser(["ADMIN"]);
  const userId = Number((await searchParams).userId) || null;
  const [users, types] = await Promise.all([
    db.user.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, employeeId: true } }),
    db.leaveType.findMany({ where: { isActive: true, needsBalance: true }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-4">
      <h1 className="h1">Balances</h1>
      <form className="card flex gap-2">
        <select className="input" name="userId" defaultValue={userId ?? ""} required>
          <option value="" disabled>Choose an employee…</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.employeeId})</option>)}
        </select>
        <button className="btn hover:cursor-pointer">Show</button>
      </form>
      {userId && (
        <>
          <AdjustForm userId={userId} types={types} />
          <BalanceTable userId={userId} />
        </>
      )}
    </div>
  );
}
export const metadata = { title: "Balances" };

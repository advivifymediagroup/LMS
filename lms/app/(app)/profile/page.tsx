import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toIso } from "@/lib/leave-days";
import { BalanceTable } from "../balance-table";

export default async function ProfilePage() {
  const me = await requireUser();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id }, include: { department: true, manager: true } });
  const rows: [string, string][] = [
    ["Employee ID", user.employeeId],
    ["Email", user.email],
    ["Role", user.role.toLowerCase()],
    ["Department", user.department?.name ?? "—"],
    ["Reports to", user.manager?.name ?? "—"],
    ["Joined", toIso(user.joiningDate)],
  ];
  return (
    <div className="space-y-4">
      <h1 className="h1">{user.name}</h1>
      <dl className="card grid max-w-xl grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
      <Link className="btn" href="/change-password">Change password</Link>
      <BalanceTable userId={user.id} />
    </div>
  );
}

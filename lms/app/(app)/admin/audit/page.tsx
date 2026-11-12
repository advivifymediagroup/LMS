import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import ChangesView from '../../changes-view';

export default async function AuditPage() {
  await requireUser(["ADMIN"]);
  const logs = await db.auditLog.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    include: {
      actor: { select: { name: true, employeeId: true } },
      targetUser: { select: { name: true, employeeId: true } },
    },
  });

  return (
    <div className="space-y-4">
      <h1 className="h1">Audit Log</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="p-2">When</th>
              <th className="p-2">Actor</th>
              <th className="p-2">Action</th>
              <th className="p-2">Target</th>
              <th className="p-2">Changes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t align-top">
                <td className="p-2 whitespace-nowrap">
                  {log.createdAt.toLocaleString()}
                </td>
                <td className="p-2">
                  {log.actor
                    ? `${log.actor.name} (${log.actor.employeeId})`
                    : "Deleted user"}
                </td>
                <td className="p-2 whitespace-nowrap">{log.action}</td>
                <td className="p-2 whitespace-nowrap">
                  {log.targetUser
                    ? `${log.targetUser.name} (${log.targetUser.employeeId})`
                    : log.entityType +
                      (log.entityId ? ` #${log.entityId}` : "")}
                </td>
                <td className="p-2">
                  <ChangesView
                    before={log.before as Record<string, any> | null}
                    after={log.after as Record<string, any> | null}
                    metadata={log.metadata as Record<string, any> | null}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export const metadata = { title: "Audit log" };

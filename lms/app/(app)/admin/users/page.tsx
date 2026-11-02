import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function UsersPage() {
  await requireUser(["ADMIN"]);
  const users = await db.user.findMany({
    include: { department: true, manager: true },
    orderBy: [{ isActive: "desc" }, { employeeId: "asc" }],
  });
  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <h1 className="h1 mb-0 mr-auto">Users</h1>
        <Link className="btn" href="/admin/users/import">Import CSV</Link>
        <Link className="btn btn-primary" href="/admin/users/new">New user</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Department</th><th>Manager</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "text-gray-400"}>
                <td>{u.employeeId}</td>
                <td>{u.name}</td>
                <td>{u.email}</td>
                <td>{u.role.toLowerCase()}</td>
                <td>{u.department?.name ?? "—"}</td>
                <td>{u.manager?.name ?? "—"}</td>
                <td>{u.isActive ? "Active" : "Inactive"}</td>
                <td><Link className="text-blue-600" href={`/admin/users/${u.id}`}>Edit</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

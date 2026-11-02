import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { createDepartment, deleteDepartment, renameDepartment } from "../actions";

export default async function DepartmentsPage({ searchParams }: PageProps<"/admin/departments">) {
  await requireUser(["ADMIN"]);
  const { error } = await searchParams;
  const departments = await db.department.findMany({
    orderBy: { name: "asc" },
    include: { users: { where: { role: "LEAD", isActive: true }, select: { name: true } }, _count: { select: { users: true } } },
  });
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="h1">Departments</h1>
      {typeof error === "string" && <p className="error">{error}</p>}
      <form action={createDepartment} className="card flex gap-2">
        <input className="input" name="name" placeholder="New department name" required />
        <button className="btn btn-primary">Add</button>
      </form>
      <div className="card p-0">
        <table className="table">
          <thead><tr><th>Name</th><th>Team leads</th><th>Users</th><th></th></tr></thead>
          <tbody>
            {departments.map((d) => (
              <tr key={d.id}>
                <td>
                  <form action={renameDepartment.bind(null, d.id)} className="flex gap-2">
                    <input className="input" name="name" defaultValue={d.name} required />
                    <button className="btn">Rename</button>
                  </form>
                </td>
                <td>{d.users.map((u) => u.name).join(", ") || "—"}</td>
                <td>{d._count.users}</td>
                <td>
                  <form action={deleteDepartment.bind(null, d.id)}>
                    <button className="btn" disabled={d._count.users > 0} title={d._count.users ? "Has users" : ""}>Delete</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-600">Team leads are assigned by giving a user the Team Lead role and a department; employees report to whoever is set as their manager.</p>
    </div>
  );
}

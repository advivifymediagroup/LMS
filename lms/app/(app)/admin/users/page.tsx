import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, todayIso } from "@/lib/leave";
import { Avatar } from "../../ui";
import { ROLES, ROLE_LABEL, usersWhere } from "./filter";

export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  await requireUser(["ADMIN"]);
  const q = await searchParams;
  const role = ROLES.find(([r]) => r === q.role)?.[0] ?? "ALL";
  const day = fromIso(await todayIso());
  const [users, onLeave] = await Promise.all([
    db.user.findMany({ where: usersWhere(q), include: { department: true, manager: true }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    db.leaveRequest.findMany({ where: { status: "APPROVED", startDate: { lte: day }, endDate: { gte: day } }, select: { userId: true } }),
  ]);
  const out = new Set(onLeave.map((l) => l.userId));
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(typeof q.q === "string" && q.q && { q: q.q }), ...(role !== "ALL" && { role }), ...extra }).toString();

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center gap-2.5">
        <form className="flex gap-2">
          {role !== "ALL" && <input type="hidden" name="role" value={role} />}
          <input className="input h-10 w-[300px] max-w-full" name="q" defaultValue={typeof q.q === "string" ? q.q : ""} placeholder="Search by name, email or ID" aria-label="Search users" />
        </form>
        <div className="flex gap-1 rounded-[10px] bg-gray-100 p-1">
          {ROLES.map(([r, label]) => (
            <Link key={r} href={`/admin/users?${new URLSearchParams({ ...(typeof q.q === "string" && q.q && { q: q.q }), ...(r !== "ALL" && { role: r }) })}`}
              className={`flex h-8 items-center rounded-[7px] px-3 text-[12.5px] font-bold ${role === r ? "bg-white text-ink shadow-[0_1px_2px_rgba(31,33,36,.08)]" : "text-gray-600"}`}>
              {label}
            </Link>
          ))}
        </div>
        <div className="flex-1" />
        <a className="btn h-10" href={`/admin/users/csv?${qs({})}`}>Export CSV</a>
        <Link className="btn h-10" href="/admin/users/import">Import CSV</Link>
        <Link className="btn btn-accent h-10" href="/admin/users/new">+ Add user</Link>
      </div>

      <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
        <table className="table min-w-[960px]">
          <thead><tr><th>User</th><th>Team</th><th>Role</th><th>Leave approver</th><th>Status</th><th>Joined</th><th /></tr></thead>
          <tbody>
            {users.map((u) => {
              const status = !u.isActive ? "Inactive" : out.has(u.id) ? "On leave" : u.onNoticePeriod ? "Notice period" : "Active";
              return (
                <tr key={u.id} className="hover:bg-[#fcfbf9]">
                  <td>
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar name={u.name} className="size-[34px] text-[11.5px]" />
                      <div className="flex min-w-0 flex-col">
                        <span className="font-bold">{u.name} <span className="font-mono text-xs font-normal text-gray-500">{u.employeeId}</span></span>
                        <span className="truncate text-[12.5px] text-gray-500">{u.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="text-gray-700">{u.department?.name ?? "—"}</td>
                  <td><span className="pill border border-gray-300 text-char">{ROLE_LABEL[u.role]}</span></td>
                  <td className="text-[13px] text-gray-700">{u.manager?.name ?? "Any admin"}</td>
                  <td>
                    <span className={`flex items-center gap-[7px] text-[13px] font-semibold ${status === "Active" ? "" : status === "Inactive" ? "text-gray-500" : "text-brand-700"}`}>
                      <span className={`size-[7px] rounded-full ${status === "Active" ? "bg-char" : status === "Inactive" ? "bg-gray-400" : "bg-brand-500"}`} />{status}
                    </span>
                  </td>
                  <td className="font-mono text-[12.5px] text-gray-600">{u.joiningDate.toISOString().slice(0, 10)}</td>
                  <td className="text-right"><Link className="link text-[13px]" href={`/admin/users/${u.id}`}>Edit</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="flex justify-between px-5 py-3 text-[12.5px] text-gray-600">
          <span>{users.length} user(s)</span>
        </div>
      </div>
    </div>
  );
}

export const metadata = { title: "Users & roles" };

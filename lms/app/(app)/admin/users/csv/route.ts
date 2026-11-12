import { requireUser } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { ROLE_LABEL, usersWhere } from "../filter";

export async function GET(req: Request) {
  await requireUser(["ADMIN"]);
  const users = await db.user.findMany({
    where: usersWhere(Object.fromEntries(new URL(req.url).searchParams)),
    include: { department: true, manager: true },
    orderBy: { name: "asc" },
  });
  const csv = toCsv([
    ["Employee ID", "Name", "Email", "Team", "Role", "Leave approver", "Joined", "Active"],
    ...users.map((u) => [u.employeeId, u.name, u.email, u.department?.name ?? "", ROLE_LABEL[u.role], u.manager?.name ?? "", u.joiningDate.toISOString().slice(0, 10), u.isActive ? "Yes" : "No"]),
  ]);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="users.csv"' } });
}

import { db } from "@/lib/db";

/** Departments and possible managers (active leads and admins) for the user form. */
export async function userFormOptions() {
  const [departments, managers] = await Promise.all([
    db.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.user.findMany({
      where: { isActive: true, role: { in: ["LEAD", "ADMIN"] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { departments, managers };
}

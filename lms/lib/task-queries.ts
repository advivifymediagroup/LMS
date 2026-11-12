import { db } from "./db";

/** Teams with their active members, for task forms. */
export function teamsWithMembers() {
  return db.department.findMany({
    orderBy: { name: "asc" },
    include: { users: { where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } } },
  });
}

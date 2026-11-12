import type { Prisma, Role } from "@prisma/client";

export const ROLES: [Role | "ALL", string][] = [["ALL", "All"], ["EMPLOYEE", "Employee"], ["LEAD", "Team lead"], ["ADMIN", "Admin"]];
export const ROLE_LABEL: Record<Role, string> = { EMPLOYEE: "Employee", LEAD: "Team lead", ADMIN: "Admin" };

/** Filter shared by this page and its CSV export. */
export function usersWhere(q: Record<string, string | string[] | undefined>): Prisma.UserWhereInput {
  const search = typeof q.q === "string" ? q.q.trim() : "";
  const role = ROLES.find(([r]) => r === q.role)?.[0];
  return {
    ...(role && role !== "ALL" && { role }),
    ...(search && { OR: [{ name: { contains: search, mode: "insensitive" } }, { email: { contains: search, mode: "insensitive" } }, { employeeId: { contains: search, mode: "insensitive" } }] }),
  };
}

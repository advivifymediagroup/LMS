import type { User } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireUser } from "./auth";
import { db } from "./db";

export const FINANCE_TEAM = "Finance";

/** Admins and members of the Finance team. */
export async function isFinance(user: Pick<User, "role" | "departmentId">) {
  if (user.role === "ADMIN") return true;
  if (!user.departmentId) return false;
  return (await db.department.findUnique({ where: { id: user.departmentId } }))?.name === FINANCE_TEAM;
}

export async function requireFinance() {
  const me = await requireUser();
  if (!(await isFinance(me))) redirect("/dashboard");
  return me;
}

export const money = (n: number | { toString(): string }, currency = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n));

/** Next number in the INV-YYYY-0001 series. */
export async function nextInvoiceNumber(today: string) {
  const prefix = `INV-${today.slice(0, 4)}-`;
  const last = await db.invoice.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 || 1 : 1;
  return prefix + String(n).padStart(4, "0");
}

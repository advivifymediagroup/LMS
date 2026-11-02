"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma, type Role } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fromIso } from "@/lib/leave";

export type FormState = { error?: string; ok?: string; tempPassword?: string } | null;

const tempPassword = () => crypto.randomBytes(6).toString("base64url") + "7a"; // always has a letter + digit
const optionalId = z.preprocess((v) => (v ? Number(v) : null), z.number().int().positive().nullable());
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

const userSchema = z.object({
  employeeId: z.string().trim().min(1, "Employee ID is required").max(20).transform((s) => s.toUpperCase()),
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email("Invalid email")),
  role: z.enum(["ADMIN", "LEAD", "EMPLOYEE"]),
  departmentId: optionalId,
  managerId: optionalId,
  joiningDate: z.iso.date("Joining date is required"),
});

export async function saveUser(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = userSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { joiningDate, ...rest } = parsed.data;
  if (id && rest.managerId === id) return { error: "A user can't be their own manager." };
  const data = { ...rest, joiningDate: fromIso(joiningDate) };

  try {
    if (id) {
      await db.user.update({ where: { id }, data: { ...data, isActive: form.get("isActive") === "on" } });
      revalidatePath("/admin/users");
      return { ok: "Saved." };
    }
    const pw = tempPassword();
    await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: true } });
    revalidatePath("/admin/users");
    return { ok: `Created ${rest.employeeId}.`, tempPassword: pw };
  } catch (e) {
    if (isUnique(e)) return { error: "That Employee ID or email already exists." };
    throw e;
  }
}

export async function resetPassword(id: number, _: FormState): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const pw = tempPassword();
  await db.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pw, 10), mustChangePassword: true } });
  return { ok: "Password reset. Share it privately; they must change it on next login.", tempPassword: pw };
}

// ---------- Departments ----------

export async function createDepartment(form: FormData) {
  await requireUser(["ADMIN"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect("/admin/departments?error=Name is required");
  try {
    await db.department.create({ data: { name } });
  } catch (e) {
    if (isUnique(e)) redirect("/admin/departments?error=That department already exists");
    throw e;
  }
  revalidatePath("/admin/departments");
}

export async function renameDepartment(id: number, form: FormData) {
  await requireUser(["ADMIN"]);
  const name = String(form.get("name") ?? "").trim();
  if (!name) redirect("/admin/departments?error=Name is required");
  try {
    await db.department.update({ where: { id }, data: { name } });
  } catch (e) {
    if (isUnique(e)) redirect("/admin/departments?error=That department already exists");
    throw e;
  }
  revalidatePath("/admin/departments");
}

export async function deleteDepartment(id: number) {
  await requireUser(["ADMIN"]);
  if (await db.user.count({ where: { departmentId: id } }))
    redirect("/admin/departments?error=Move its users to another department first");
  await db.department.delete({ where: { id } });
  revalidatePath("/admin/departments");
}

// ---------- CSV import ----------

export type ImportResult = { error?: string; rows?: { line: number; employeeId: string; status: string; tempPassword?: string }[] } | null;

const BALANCE_COLUMNS = ["CL", "SL", "OL"];

/**
 * Header: employee_id,name,email,role,department,manager_employee_id,joining_date[,CL,SL,OL]
 * New users get a temp password; existing users (by employee_id) are updated.
 * Balance columns set the opening balance (re-importing overwrites it).
 */
export async function importUsers(_: ImportResult, form: FormData): Promise<ImportResult> {
  const admin = await requireUser(["ADMIN"]);
  const file = form.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Choose a CSV file." };

  // ponytail: plain comma split, no quoted fields. Use a CSV parser if names contain commas.
  const lines = (await file.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines[0]?.split(",").map((h) => h.trim().toLowerCase());
  const required = ["employee_id", "name", "email", "role", "department", "manager_employee_id", "joining_date"];
  const missing = required.filter((h) => !header?.includes(h));
  if (missing.length) return { error: `Missing columns: ${missing.join(", ")}` };

  const types = await db.leaveType.findMany({ where: { code: { in: BALANCE_COLUMNS } } });
  const rows: NonNullable<ImportResult>["rows"] = [];
  const managers: { employeeId: string; manager: string; line: number }[] = [];

  for (const [i, line] of lines.slice(1).entries()) {
    const cells = line.split(",").map((c) => c.trim());
    const get = (h: string) => cells[header!.indexOf(h)] ?? "";
    const lineNo = i + 2;
    const parsed = userSchema.omit({ departmentId: true, managerId: true }).safeParse({
      employeeId: get("employee_id"),
      name: get("name"),
      email: get("email"),
      role: get("role").toUpperCase(),
      joiningDate: get("joining_date"),
    });
    if (!parsed.success) {
      rows.push({ line: lineNo, employeeId: get("employee_id"), status: `Skipped: ${parsed.error.issues[0].message}` });
      continue;
    }
    const { joiningDate, ...p } = parsed.data;
    const deptName = get("department");
    const dept = deptName
      ? await db.department.upsert({ where: { name: deptName }, update: {}, create: { name: deptName } })
      : null;
    const data = { ...p, role: p.role as Role, departmentId: dept?.id ?? null, joiningDate: fromIso(joiningDate) };

    try {
      const existing = await db.user.findUnique({ where: { employeeId: p.employeeId } });
      let pw: string | undefined;
      const user = existing
        ? await db.user.update({ where: { id: existing.id }, data })
        : await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash((pw = tempPassword()), 10) } });

      for (const t of types) {
        const raw = get(t.code.toLowerCase());
        if (!raw) continue;
        const days = Number(raw);
        if (!Number.isFinite(days) || days * 2 !== Math.round(days * 2)) continue;
        const key = { userId: user.id, leaveTypeId: t.id, kind: "OPENING" as const, period: "opening" };
        await db.leaveLedger.upsert({
          where: { userId_leaveTypeId_kind_period: key },
          update: { days, createdById: admin.id },
          create: { ...key, days, note: "Opening balance (CSV import)", createdById: admin.id },
        });
      }
      rows.push({ line: lineNo, employeeId: p.employeeId, status: existing ? "Updated" : "Created", tempPassword: pw });
      if (get("manager_employee_id")) managers.push({ employeeId: p.employeeId, manager: get("manager_employee_id").toUpperCase(), line: lineNo });
    } catch (e) {
      rows.push({ line: lineNo, employeeId: p.employeeId, status: isUnique(e) ? "Skipped: email already used by another user" : "Skipped: error" });
    }
  }

  // Second pass so managers can appear later in the file than their reports.
  for (const m of managers) {
    const mgr = await db.user.findUnique({ where: { employeeId: m.manager } });
    const row = rows.find((r) => r.line === m.line)!;
    if (!mgr || mgr.employeeId === m.employeeId) row.status += ` (manager ${m.manager} not found)`;
    else await db.user.update({ where: { employeeId: m.employeeId }, data: { managerId: mgr.id } });
  }
  revalidatePath("/admin/users");
  return { rows };
}

// ---------- Balance adjustment ----------

export async function adjustBalance(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const parsed = z
    .object({
      userId: z.coerce.number().int().positive(),
      leaveTypeId: z.coerce.number().int().positive("Choose a leave type"),
      days: z.coerce.number().refine((d) => d !== 0 && d * 2 === Math.round(d * 2), "Days must be a non-zero multiple of 0.5"),
      note: z.string().trim().min(3, "Give a reason for the adjustment").max(300),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  await db.leaveLedger.create({ data: { ...parsed.data, kind: "MANUAL", createdById: admin.id } });
  revalidatePath("/admin/balances");
  return { ok: "Adjustment saved." };
}

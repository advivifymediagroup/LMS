"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TaskStatus } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { fromIso } from "@/lib/leave";
import { canEditTask, canMoveTask } from "@/lib/task-rules";
import type { FormState } from "../admin/actions";

const STATUSES = ["TODO", "DOING", "REVIEW", "DONE"] as const;

const TaskInput = z.object({
  title: z.string().trim().min(3, "Title needs at least 3 characters.").max(200),
  description: z.string().trim().max(5000).optional().transform((v) => v || null),
  kind: z.string().trim().max(40).optional().transform((v) => v || "Task"),
  priority: z.enum(["LOW", "MED", "HIGH"]),
  status: z.enum(STATUSES).optional(),
  dueDate: z.union([z.iso.date(), z.literal("")]).optional().transform((v) => (v ? fromIso(v) : null)),
  departmentId: z.coerce.number().int().positive("Pick a team."),
  assigneeId: z.union([z.coerce.number().int().positive(), z.literal("")]).optional().transform((v) => (v ? v : null)),
});

/** Checks the team and assignee are allowed for this user. Returns an error message or null. */
async function checkScope(me: Awaited<ReturnType<typeof requireUser>>, departmentId: number, assigneeId: number | null) {
  if (me.role !== "ADMIN" && departmentId !== me.departmentId) return "You can only add tasks to your own team.";
  if (!(await db.department.findUnique({ where: { id: departmentId } }))) return "That team doesn't exist.";
  if (assigneeId) {
    const a = await db.user.findUnique({ where: { id: assigneeId } });
    if (!a?.isActive) return "Pick an active person to assign.";
    if (a.departmentId !== departmentId) return "The assignee must be in the task's team.";
    if (me.role === "EMPLOYEE" && a.id !== me.id) return "Only team leads and admins can assign tasks to someone else.";
  }
  return null;
}

export async function createTask(_: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = TaskInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { status, ...data } = parsed.data;
  const problem = await checkScope(me, data.departmentId, data.assigneeId);
  if (problem) return { error: problem };

  const task = await db.$transaction(async (tx) => {
    const t = await tx.task.create({ data: { ...data, status: status ?? "TODO", createdById: me.id, completedAt: status === "DONE" ? new Date() : null } });
    await writeAudit(tx, { actorId: me.id, targetUserId: t.assigneeId, action: "CREATE", entityType: "TASK", entityId: t.id, after: t });
    return t;
  });
  revalidatePath("/", "layout");
  redirect(`/tasks/board?team=${task.departmentId}`);
}

export async function updateTask(id: number, _: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const before = await db.task.findUnique({ where: { id } });
  if (!before) return { error: "That task no longer exists." };
  if (!canEditTask(me, before)) return { error: "You can't edit this task." };
  const parsed = TaskInput.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { status = before.status, ...data } = parsed.data;
  const problem = await checkScope(me, data.departmentId, data.assigneeId);
  if (problem) return { error: problem };

  await db.$transaction(async (tx) => {
    const after = await tx.task.update({ where: { id }, data: { ...data, status, completedAt: completedAt(before.status, status, before.completedAt) } });
    await writeAudit(tx, { actorId: me.id, targetUserId: after.assigneeId, action: "UPDATE", entityType: "TASK", entityId: id, before, after });
  });
  revalidatePath("/", "layout");
  return { ok: "Task saved." };
}

/** Board column moves and the My tasks checkbox. */
export async function setTaskStatus(id: number, status: TaskStatus) {
  const me = await requireUser();
  if (!STATUSES.includes(status)) return;
  const before = await db.task.findUnique({ where: { id } });
  if (!before || !canMoveTask(me, before) || before.status === status) return;
  await db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { status, completedAt: completedAt(before.status, status, before.completedAt) } });
    await writeAudit(tx, { actorId: me.id, targetUserId: before.assigneeId, action: "STATUS", entityType: "TASK", entityId: id, before: { status: before.status }, after: { status } });
  });
  revalidatePath("/", "layout");
}

export async function deleteTask(id: number) {
  const me = await requireUser();
  const before = await db.task.findUnique({ where: { id } });
  if (!before || !canEditTask(me, before)) redirect("/tasks/board");
  await db.$transaction(async (tx) => {
    await tx.task.delete({ where: { id } });
    await writeAudit(tx, { actorId: me.id, targetUserId: before!.assigneeId, action: "DELETE", entityType: "TASK", entityId: id, before });
  });
  revalidatePath("/", "layout");
  redirect(`/tasks/board?team=${before!.departmentId ?? "all"}`);
}

const completedAt = (from: TaskStatus, to: TaskStatus, prev: Date | null) => (to !== "DONE" ? null : from === "DONE" ? prev : new Date());

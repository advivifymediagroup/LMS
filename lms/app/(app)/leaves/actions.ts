"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { checkLeave, fromIso, getBalances, todayIso, type LeaveCheck } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { notifyApplied, notifyCancelled, notifyDecision } from "@/lib/notify";
import { writeAudit } from "@/lib/audit";

const half = z.enum(["FULL", "FIRST", "SECOND"]);
const inputSchema = z.object({
  leaveTypeId: z.coerce.number().int().positive("Choose a leave type"),
  startDate: z.iso.date("Choose a start date"),
  endDate: z.iso.date("Choose an end date"),
  startHalf: half.default("FULL"),
  endHalf: half.default("FULL"),
});

const fields = (form: FormData) => {
  const raw = Object.fromEntries(form);
  if (!raw.endDate) raw.endDate = raw.startDate; // single-day leave
  return raw;
};

export type Preview = Omit<Extract<LeaveCheck, { ok: true }>, "type"> | Extract<LeaveCheck, { ok: false }> | null;

/** Live day count + policy check while the form is being filled. Writes nothing. */
export async function previewLeave(form: FormData): Promise<Preview> {
  const user = await requireUser();
  const parsed = inputSchema.safeParse(fields(form));
  if (!parsed.success) return null;
  const res = await checkLeave(user, parsed.data);
  if (!res.ok) return res;
  const { type: _type, ...rest } = res;
  return rest;
}

export async function applyLeave(_: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser();
  const parsed = inputSchema
    .extend({
      reason: z.string().trim().min(3, "Give a reason").max(1000),
      note: z.string().trim().max(1000).optional(),
      cc: z.string().optional(),
    })
    .safeParse(fields(form));
  if (!parsed.success) return parsed.error.issues[0].message;
  const { reason, note, cc, ...input } = parsed.data;

  const ccEmails = (cc ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const badEmail = ccEmails.find((e) => !z.email().safeParse(e).success);
  if (badEmail) return `Not a valid email to notify: ${badEmail}`;

  const check = await checkLeave(user, input);
  if (!check.ok) return check.error;

  // An admin with no manager has nobody to approve them: auto-approve.
  const autoApprove = user.role === "ADMIN" && !user.managerId;
  const single = input.startDate === input.endDate;
  const leave = await db.$transaction(async (tx) => {
    const created = await tx.leaveRequest.create({
      data: {
        userId: user.id,
        leaveTypeId: input.leaveTypeId,
        startDate: fromIso(input.startDate),
        endDate: fromIso(input.endDate),
        startHalf: input.startHalf,
        endHalf: single ? input.startHalf : input.endHalf,
        days: check.days,
        reason,
        note: note || null,
        ccEmails,
        ...(autoApprove ? { status: "APPROVED", approverId: user.id, decidedAt: new Date(), decisionReason: "Auto-approved (admin)" } : {}),
      },
    });
    if (autoApprove && check.type.needsBalance) {
      await tx.leaveLedger.create({
        data: { userId: user.id, leaveTypeId: input.leaveTypeId, days: -check.days, kind: "LEAVE", leaveRequestId: created.id },
      });
    }
    await writeAudit(tx, { actorId: user.id, targetUserId: user.id, action: autoApprove ? "AUTO_APPROVE" : "APPLY", entityType: "LEAVE_REQUEST", entityId: created.id, after: { status: created.status, startDate: created.startDate, endDate: created.endDate, days: created.days, leaveTypeId: created.leaveTypeId } });
    return created;
  });
  after(() => notifyApplied(leave.id));
  revalidatePath("/", "layout");
  redirect(`/leaves/${leave.id}`);
}

export async function cancelLeave(id: number) {
  const user = await requireUser();
  const leave = await db.leaveRequest.findUnique({ where: { id }, include: { leaveType: true } });
  if (!leave || leave.userId !== user.id) redirect("/leaves");
  const today = await todayIso();
  const canCancel = leave.status === "PENDING" || (leave.status === "APPROVED" && toIso(leave.startDate) > today);
  if (!canCancel) redirect(`/leaves/${id}?error=This leave can no longer be cancelled`);

  const cancelled = await db.$transaction(async (tx) => {
    // Guard against double-submit: only flip if still in the status we checked.
    const { count } = await tx.leaveRequest.updateMany({ where: { id, status: leave.status }, data: { status: "CANCELLED" } });
    if (count && leave.status === "APPROVED" && leave.leaveType.needsBalance) {
      await tx.leaveLedger.create({
        data: { userId: user.id, leaveTypeId: leave.leaveTypeId, days: leave.days, kind: "REFUND", leaveRequestId: id, note: "Cancelled" },
      });
    }
    if (count) await writeAudit(tx, { actorId: user.id, targetUserId: user.id, action: "CANCEL", entityType: "LEAVE_REQUEST", entityId: id, before: { status: leave.status }, after: { status: "CANCELLED" } });
    return count > 0;
  });
  if (cancelled) after(() => notifyCancelled(id, leave.status === "APPROVED"));
  revalidatePath("/", "layout");
  redirect(`/leaves/${id}`);
}

export async function decideLeave(id: number, form: FormData) {
  const me = await requireUser(["LEAD", "ADMIN"]);
  const decision = form.get("decision");
  const reason = String(form.get("reason") ?? "").trim();
  const back = (msg: string) => redirect(`/approvals?error=${encodeURIComponent(msg)}`);

  const leave = await db.leaveRequest.findUnique({ where: { id }, include: { user: true, leaveType: true } });
  if (!leave || leave.status !== "PENDING") back("That request is no longer pending.");
  if (leave!.userId === me.id) back("You can't decide your own leave.");
  if (me.role !== "ADMIN" && leave!.user.managerId !== me.id) back("Only their manager or an admin can decide this.");
  if (decision === "REJECT" && reason.length < 3) back("Give a reason for rejecting.");

  if (decision === "APPROVE" && leave!.leaveType.needsBalance) {
    const bal = (await getBalances(leave!.userId, id)).find((b) => b.type.id === leave!.leaveTypeId);
    if ((bal?.available ?? 0) < Number(leave!.days)) back(`Not enough balance left for ${leave!.user.name} to approve this.`);
  }

  const decided = await db.$transaction(async (tx) => {
    const { count } = await tx.leaveRequest.updateMany({
      where: { id, status: "PENDING" },
      data: {
        status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
        approverId: me.id,
        decidedAt: new Date(),
        decisionReason: reason || null,
      },
    });
    if (count && decision === "APPROVE" && leave!.leaveType.needsBalance) {
      await tx.leaveLedger.create({
        data: { userId: leave!.userId, leaveTypeId: leave!.leaveTypeId, days: -Number(leave!.days), kind: "LEAVE", leaveRequestId: id },
      });
    }
    if (count) await writeAudit(tx, { actorId: me.id, targetUserId: leave!.userId, action: decision === "APPROVE" ? "APPROVE" : "REJECT", entityType: "LEAVE_REQUEST", entityId: id, before: { status: leave!.status }, after: { status: decision === "APPROVE" ? "APPROVED" : "REJECTED", decisionReason: reason || null } });
    return count > 0;
  });
  if (decided) after(() => notifyDecision(id));
  revalidatePath("/", "layout");
  redirect("/approvals");
}

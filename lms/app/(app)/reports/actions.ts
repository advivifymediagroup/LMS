"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { canReviewReport, draftReport } from "@/lib/performance";
import { PROJECT_STATUSES, type ReportData } from "@/lib/team-config";
import type { FormState } from "../admin/actions";

const text = (form: FormData, k: string, max = 4000) => String(form.get(k) ?? "").trim().slice(0, max);
const lines = (form: FormData, k: string, max = 20) => text(form, k, 10000).split(/\r?\n/).map((l) => l.replace(/^\s*[-•*\d.)]+\s*/, "").trim()).filter(Boolean).slice(0, max);

/** Opens (or creates) the signed-in user's report for a month, then goes to its editor. */
export async function startReport(form: FormData) {
  const me = await requireUser();
  const month = String(form.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > (await todayIso()).slice(0, 7)) redirect("/reports?error=Pick this month or an earlier one");
  let report = await db.performanceReport.findUnique({ where: { userId_month: { userId: me.id, month } } });
  if (!report) {
    const user = await db.user.findUniqueOrThrow({ where: { id: me.id }, include: { department: true } });
    const draft = await draftReport(user, month);
    report = await db.performanceReport.create({ data: { userId: me.id, month, team: user.department?.name, ...draft } });
  }
  redirect(report.status === "DRAFT" ? `/reports/${report.id}/edit` : `/reports/${report.id}`);
}

export async function saveReport(id: number, _: FormState, form: FormData): Promise<FormState> {
  const me = await requireUser();
  const report = await db.performanceReport.findUnique({ where: { id } });
  if (!report || report.userId !== me.id) return { error: "You can only edit your own report." };
  if (report.status !== "DRAFT") return { error: "This report is submitted. Ask your lead to return it if it needs changes." };

  const projects = [];
  for (let i = 0; i < 40; i++) {
    const name = text(form, `p_name_${i}`, 200);
    if (!name) continue;
    const status = text(form, `p_status_${i}`);
    projects.push({ name, status: PROJECT_STATUSES.includes(status) ? status : "In Progress", outcome: text(form, `p_outcome_${i}`, 1000) });
  }
  const data: ReportData = {
    summary: text(form, "summary"),
    responsibilities: lines(form, "responsibilities"),
    achievements: lines(form, "achievements"),
    projects,
    challenges: text(form, "challenges"),
    support: text(form, "support"),
    learning: lines(form, "learning"),
    highlights: lines(form, "highlights", 3),
    selfAssessment: text(form, "selfAssessment"),
    objectives: lines(form, "objectives"),
  };
  const submit = form.get("intent") === "submit";
  if (submit && !data.summary) return { error: "Add a summary before submitting." };
  await db.performanceReport.update({
    where: { id },
    data: { designation: text(form, "designation", 120), data, ...(submit && { status: "SUBMITTED", submittedAt: new Date() }) },
  });
  if (submit) {
    await writeAudit(db, { actorId: me.id, targetUserId: me.id, action: "SUBMIT", entityType: "REPORT", entityId: id, metadata: { month: report.month } });
    revalidatePath("/reports");
    redirect(`/reports/${id}`);
  }
  return { ok: "Draft saved." };
}

async function reviewable(id: number) {
  const me = await requireUser(["LEAD", "ADMIN"]);
  const report = await db.performanceReport.findUnique({ where: { id }, include: { user: true } });
  if (!report || !canReviewReport(me, report.user)) redirect("/reports");
  return { me, report };
}

export async function saveReview(id: number, _: FormState, form: FormData): Promise<FormState> {
  const { me } = await reviewable(id);
  await db.performanceReport.update({ where: { id }, data: { reviewerComment: text(form, "comment") || null, reviewedById: me.id, reviewedAt: new Date() } });
  revalidatePath(`/reports/${id}`);
  return { ok: "Comment saved." };
}

/** Sends a submitted report back to its author as a draft. */
export async function returnReport(id: number) {
  const { me, report } = await reviewable(id);
  await db.performanceReport.update({ where: { id }, data: { status: "DRAFT", submittedAt: null } });
  await writeAudit(db, { actorId: me.id, targetUserId: report.userId, action: "RETURN", entityType: "REPORT", entityId: id, metadata: { month: report.month } });
  revalidatePath(`/reports/${id}`);
}

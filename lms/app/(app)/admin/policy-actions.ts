"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fromIso, getSetting, todayIso } from "@/lib/leave";
import { runAllJobs, runDailyReminder } from "@/lib/jobs";
import { sendMail, type SmtpSettings } from "@/lib/mail";
import type { FormState } from "./actions";

const halfDays = z.coerce.number().min(0).max(366).refine((d) => d * 2 === Math.round(d * 2), "Use multiples of 0.5");
const wholeDays = z.coerce.number().int().min(0).max(366);
const optional = <T extends z.ZodType>(s: T) => z.preprocess((v) => (v === "" || v == null ? null : v), s.nullable());
const flag = (form: FormData, name: string) => form.get(name) === "on";

// ---------- Leave types ----------

const typeSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(60),
  monthlyCredit: halfDays,
  yearlyQuota: halfDays,
  maxCarryForward: optional(halfDays),
  noticeDays: wholeDays,
  longLeaveDays: optional(wholeDays),
  longNoticeDays: wholeDays,
  backdateDays: wholeDays,
  certificateAfterDays: optional(wholeDays),
});

export async function saveLeaveType(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const parsed = typeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: `${parsed.error.issues[0].path.join(".")}: ${parsed.error.issues[0].message}` };
  const data = {
    ...parsed.data,
    needsBalance: flag(form, "needsBalance"),
    allowHalfDay: flag(form, "allowHalfDay"),
    sandwichCounts: flag(form, "sandwichCounts"),
    blockedOnProbation: flag(form, "blockedOnProbation"),
    blockedOnNotice: flag(form, "blockedOnNotice"),
    optionalHolidayOnly: flag(form, "optionalHolidayOnly"),
    isActive: flag(form, "isActive"),
  };
  try {
    if (id) await db.leaveType.update({ where: { id }, data });
    else {
      const code = String(form.get("code") ?? "").trim().toUpperCase();
      if (!/^[A-Z]{2,10}$/.test(code)) return { error: "Code must be 2–10 letters, e.g. ML." };
      await db.leaveType.create({ data: { ...data, code } });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That code already exists." };
    throw e;
  }
  revalidatePath("/admin/leave-types");
  return { ok: "Saved." };
}

// ---------- Holidays ----------

export async function addHoliday(form: FormData) {
  await requireUser(["ADMIN"]);
  const parsed = z
    .object({ date: z.iso.date("Pick a date"), name: z.string().trim().min(2, "Name is required").max(80) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) redirect(`/admin/holidays?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const { date, name } = parsed.data;
  const isOptional = flag(form, "isOptional");
  await db.holiday.upsert({ where: { date: fromIso(date) }, update: { name, isOptional }, create: { date: fromIso(date), name, isOptional } });
  revalidatePath("/admin/holidays");
  redirect(`/admin/holidays?year=${date.slice(0, 4)}`);
}

export async function deleteHoliday(id: number) {
  await requireUser(["ADMIN"]);
  await db.holiday.delete({ where: { id } });
  revalidatePath("/admin/holidays");
}

// ---------- System settings ----------

export async function saveSettings(_: FormState, form: FormData): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const workingDays = form.getAll("workingDays").map(Number).filter((d) => d >= 0 && d <= 6).sort();
  if (!workingDays.length) return { error: "Pick at least one working day." };

  const timezone = String(form.get("timezone") ?? "").trim();
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
  } catch {
    return { error: `Unknown timezone "${timezone}". Use a name like Asia/Kolkata.` };
  }
  const probationMonths = Number(form.get("probationMonths"));
  if (!Number.isInteger(probationMonths) || probationMonths < 0 || probationMonths > 24) return { error: "Probation must be 0–24 months." };
  const creditsFrom = String(form.get("creditsFrom") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(creditsFrom)) return { error: "Pick the month automatic credits start from." };

  const notifyAlways = String(form.get("notifyAlways") ?? "").split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = notifyAlways.find((e) => !z.email().safeParse(e).success);
  if (bad) return { error: `Not a valid email: ${bad}` };

  const old = await getSetting<SmtpSettings | null>("smtp", null);
  const smtp: SmtpSettings = {
    host: String(form.get("smtpHost") ?? "").trim(),
    port: Number(form.get("smtpPort")) || 587,
    secure: flag(form, "smtpSecure"),
    user: String(form.get("smtpUser") ?? "").trim(),
    pass: String(form.get("smtpPass") ?? "") || old?.pass || "", // blank keeps the saved password
    from: String(form.get("smtpFrom") ?? "").trim(),
  };
  if (smtp.host && !smtp.from) return { error: "Set a From address for emails." };

  const values: Record<string, Prisma.InputJsonValue> = { workingDays, timezone, probationMonths, creditsFrom, notifyAlways, smtp };
  await db.$transaction(
    Object.entries(values).map(([key, value]) => db.setting.upsert({ where: { key }, update: { value }, create: { key, value } })),
  );
  revalidatePath("/", "layout");
  return { ok: "Settings saved." };
}

export async function sendTestEmail(_: FormState): Promise<FormState> {
  const me = await requireUser(["ADMIN"]);
  try {
    await sendMail({ to: [me.email], subject: "Leave Management test email", text: "SMTP settings work." });
    return { ok: `Test email sent to ${me.email}.` };
  } catch (e) {
    return { error: `Sending failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

export async function runJobsNow(_: FormState): Promise<FormState> {
  await requireUser(["ADMIN"]);
  const r = await runAllJobs();
  return { ok: `Jobs ran for ${r.today}: ${r.monthlyCredits} monthly credit(s), ${r.yearlyCredits} yearly credit(s), ${r.yearEndExpiries} expiry row(s), ${r.remindersSent} reminder email(s).` };
}

export async function sendRemindersNow(_: FormState): Promise<FormState> {
  await requireUser(["ADMIN"]);
  return { ok: `Sent ${await runDailyReminder(await todayIso(), true)} reminder email(s).` };
}

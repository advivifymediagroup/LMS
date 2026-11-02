// Scheduled jobs. Each is safe to re-run any number of times: credit rows are unique on
// user + type + kind + period, so a second run inserts nothing.
import type { LeaveLedger } from "@prisma/client";
import { db } from "./db";
import { getSetting, probationEnd, todayIso } from "./leave";
import { firstCreditMonth, monthRange, proRatedQuota, toIso } from "./leave-days";
import { sendPendingReminders } from "./notify";

type NewRow = Pick<LeaveLedger, "userId" | "leaveTypeId" | "kind" | "period" | "note"> & { days: number };

const insert = async (rows: NewRow[]) =>
  rows.length ? (await db.leaveLedger.createMany({ data: rows, skipDuplicates: true })).count : 0;

/** "YYYY-MM" before which nothing is credited automatically (opening balances cover it). */
const creditsFrom = async (today: string) => (await getSetting<string | null>("creditsFrom", null)) ?? today.slice(0, 7);

/**
 * Monthly credit for every month from max(creditsFrom, first credit month) to now.
 * Catch-up means a missed run, or a probation that just ended, credits all owed months at once.
 */
export async function runMonthlyCredits(today: string) {
  const [types, users, from] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true, monthlyCredit: { gt: 0 } } }),
    db.user.findMany({ where: { isActive: true } }),
    creditsFrom(today),
  ]);
  const rows: NewRow[] = [];
  for (const u of users) {
    const joinMonth = firstCreditMonth(toIso(u.joiningDate));
    const months = monthRange(joinMonth > from ? joinMonth : from, today.slice(0, 7));
    const onProbation = today < (await probationEnd(u));
    for (const t of types) {
      if (t.blockedOnProbation && onProbation) continue; // held until probation ends
      for (const period of months) {
        rows.push({ userId: u.id, leaveTypeId: t.id, kind: "MONTHLY_CREDIT", period, days: Number(t.monthlyCredit), note: `Monthly credit ${period}` });
      }
    }
  }
  return insert(rows);
}

/**
 * Yearly quota for the current year. People who joined before `creditsFrom` start getting it
 * the first full year after launch (their opening balance covers the launch year). Later
 * joiners get it pro-rated in their joining year.
 */
export async function runYearlyCredits(today: string) {
  const year = today.slice(0, 4);
  const [types, users, from] = await Promise.all([
    db.leaveType.findMany({ where: { isActive: true, yearlyQuota: { gt: 0 } } }),
    db.user.findMany({ where: { isActive: true } }),
    creditsFrom(today),
  ]);
  const rows: NewRow[] = [];
  for (const u of users) {
    const joinMonth = firstCreditMonth(toIso(u.joiningDate));
    let mode: "full" | "prorated" | "none";
    if (joinMonth < from) mode = `${year}-01` >= from ? "full" : "none"; // on staff at launch
    else if (joinMonth.startsWith(year)) mode = "prorated"; // joined this year
    else mode = joinMonth < `${year}-01` ? "full" : "none"; // joined in an earlier year, or not yet
    if (mode === "none") continue;
    for (const t of types) {
      const days = mode === "full" ? Number(t.yearlyQuota) : proRatedQuota(Number(t.yearlyQuota), joinMonth);
      if (days > 0) rows.push({ userId: u.id, leaveTypeId: t.id, kind: "YEARLY_CREDIT", period: year, days, note: `Yearly credit ${year}` });
    }
  }
  return insert(rows);
}

/**
 * Closes last year: balance above a type's carry-forward cap expires.
 * Only rows created before Jan 1 count, so it gives the same answer whenever it runs.
 */
export async function runYearEnd(today: string) {
  const year = Number(today.slice(0, 4)) - 1;
  if (year < Number((await creditsFrom(today)).slice(0, 4))) return 0;
  const types = await db.leaveType.findMany({ where: { needsBalance: true, maxCarryForward: { not: null } } });
  if (!types.length) return 0;
  // ponytail: cut-off is midnight UTC, not company timezone; only rows logged in the first 5.5 hours of Jan 1 IST could land on the wrong side.
  const sums = await db.leaveLedger.groupBy({
    by: ["userId", "leaveTypeId"],
    where: { leaveTypeId: { in: types.map((t) => t.id) }, createdAt: { lt: new Date(`${year + 1}-01-01T00:00:00Z`) }, user: { isActive: true } },
    _sum: { days: true },
  });
  const rows: NewRow[] = [];
  for (const s of sums) {
    const cap = Number(types.find((t) => t.id === s.leaveTypeId)!.maxCarryForward);
    const excess = Number(s._sum.days ?? 0) - cap;
    if (excess > 0)
      rows.push({ userId: s.userId, leaveTypeId: s.leaveTypeId, kind: "EXPIRY", period: String(year), days: -excess, note: `Year-end ${year}: above carry-forward limit of ${cap}` });
  }
  return insert(rows);
}

/** Daily pending-approval digest, once per day from 9:00 company time. */
export async function runDailyReminder(today: string, force = false) {
  const tz = await getSetting("timezone", "Asia/Kolkata");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const last = await getSetting<string | null>("lastReminderDate", null);
  if (!force && (hour < 9 || last === today)) return 0;
  const sent = await sendPendingReminders();
  await db.setting.upsert({ where: { key: "lastReminderDate" }, update: { value: today }, create: { key: "lastReminderDate", value: today } });
  return sent;
}

/** Year-end first, so new-year credits never count toward last year's expiry. */
export async function runAllJobs() {
  const today = await todayIso();
  const result: Record<string, number | string> = { today };
  for (const [name, job] of [
    ["yearEndExpiries", runYearEnd],
    ["yearlyCredits", runYearlyCredits],
    ["monthlyCredits", runMonthlyCredits],
    ["remindersSent", runDailyReminder],
  ] as const) {
    try {
      result[name] = await job(today);
    } catch (e) {
      console.error(`[jobs] ${name} failed`, e);
      result[name] = "failed (see server log)";
    }
  }
  return result;
}

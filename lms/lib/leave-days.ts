// Pure date + day-count logic. No imports so it runs under `node --test` as-is.
// All dates are ISO "YYYY-MM-DD" strings, treated as UTC calendar days.

export type Half = "FULL" | "FIRST" | "SECOND";

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonths(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

export function dayOfWeek(iso: string): number {
  return new Date(iso + "T00:00:00Z").getUTCDay();
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- Credit periods ("YYYY-MM") ----------

/** First month a joiner earns credit: their joining month if they joined by the 15th, else the next. */
export function firstCreditMonth(joiningIso: string): string {
  const month = joiningIso.slice(0, 7);
  return Number(joiningIso.slice(8, 10)) <= 15 ? month : addMonths(month + "-01", 1).slice(0, 7);
}

/** Every month from `from` to `to`, inclusive. */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m + "-01", 1).slice(0, 7)) out.push(m);
  return out;
}

/** Yearly quota for someone whose credit starts at `startMonth` that year, rounded down to 0.5. */
export function proRatedQuota(quota: number, startMonth: string): number {
  const months = 13 - Number(startMonth.slice(5, 7));
  return Math.floor(((quota * months) / 12) * 2) / 2;
}

export function describeDates(start: string, end: string, startHalf: Half, endHalf: Half): string {
  const half = (h: Half) => (h === "FIRST" ? " (first half)" : h === "SECOND" ? " (second half)" : "");
  return start === end ? start + half(startHalf) : `${start}${half(startHalf)} to ${end}${half(endHalf)}`;
}

export type DayCountOptions = {
  workingDays: number[]; // 0 = Sunday ... 6 = Saturday
  holidays: Set<string>; // non-optional holidays only
  sandwichCounts: boolean; // count weekends/holidays that fall between leave days
};

export function isWorkingDay(iso: string, o: Pick<DayCountOptions, "workingDays" | "holidays">) {
  return o.workingDays.includes(dayOfWeek(iso)) && !o.holidays.has(iso);
}

/**
 * Days charged for a leave from `start` to `end`.
 * Single day: startHalf FIRST/SECOND = 0.5.
 * Multi-day: startHalf SECOND and/or endHalf FIRST each take off 0.5.
 * Non-working days at the edges are never charged; between leave days they are
 * charged only when `sandwichCounts` is on.
 */
export function countLeaveDays(
  start: string,
  end: string,
  startHalf: Half,
  endHalf: Half,
  o: DayCountOptions,
): number {
  if (end < start) return 0;
  const days = datesBetween(start, end).map((d) => isWorkingDay(d, o));
  const first = days.indexOf(true);
  if (first < 0) return 0;
  if (start === end) return startHalf === "FULL" ? 1 : 0.5;

  const last = days.lastIndexOf(true);
  let total = o.sandwichCounts ? last - first + 1 : days.filter(Boolean).length;
  if (days[0] && startHalf !== "FULL") total -= 0.5;
  if (days[days.length - 1] && endHalf !== "FULL") total -= 0.5;
  return total;
}

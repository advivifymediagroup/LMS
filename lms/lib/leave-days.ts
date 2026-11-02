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

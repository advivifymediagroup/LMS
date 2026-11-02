import { test } from "node:test";
import assert from "node:assert/strict";
import { countLeaveDays, firstCreditMonth, monthRange, proRatedQuota, type DayCountOptions } from "./leave-days.ts";

// 2026-11-02 is a Monday.
const base: DayCountOptions = { workingDays: [1, 2, 3, 4, 5], holidays: new Set(), sandwichCounts: false };
const sandwich = { ...base, sandwichCounts: true };
const F = "FULL", A = "FIRST", B = "SECOND";

test("full working week = 5", () => {
  assert.equal(countLeaveDays("2026-11-02", "2026-11-06", F, F, base), 5);
});

test("Fri to Mon: 2 without sandwich, 4 with", () => {
  assert.equal(countLeaveDays("2026-11-06", "2026-11-09", F, F, base), 2);
  assert.equal(countLeaveDays("2026-11-06", "2026-11-09", F, F, sandwich), 4);
});

test("single half day = 0.5", () => {
  assert.equal(countLeaveDays("2026-11-03", "2026-11-03", A, A, base), 0.5);
});

test("Mon second half to Tue first half = 1", () => {
  assert.equal(countLeaveDays("2026-11-02", "2026-11-03", B, A, base), 1);
});

test("holiday mid-week is skipped", () => {
  const o = { ...base, holidays: new Set(["2026-11-04"]) };
  assert.equal(countLeaveDays("2026-11-02", "2026-11-06", F, F, o), 4);
});

test("weekend only = 0", () => {
  assert.equal(countLeaveDays("2026-11-07", "2026-11-08", F, F, sandwich), 0);
});

test("weekend at the edges is never charged, even with sandwich", () => {
  assert.equal(countLeaveDays("2026-11-07", "2026-11-09", F, F, sandwich), 1);
});

test("half day on a non-working edge changes nothing", () => {
  assert.equal(countLeaveDays("2026-11-07", "2026-11-10", B, F, base), 2);
});

test("end before start = 0", () => {
  assert.equal(countLeaveDays("2026-11-05", "2026-11-02", F, F, base), 0);
});

test("joiners by the 15th earn credit that month, later joiners from the next", () => {
  assert.equal(firstCreditMonth("2026-03-15"), "2026-03");
  assert.equal(firstCreditMonth("2026-03-16"), "2026-04");
  assert.equal(firstCreditMonth("2026-12-20"), "2027-01");
});

test("month range is inclusive and crosses years", () => {
  assert.deepEqual(monthRange("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(monthRange("2026-05", "2026-04"), []);
});

test("yearly quota is pro-rated by months left, rounded down to 0.5", () => {
  assert.equal(proRatedQuota(8, "2026-01"), 8);
  assert.equal(proRatedQuota(8, "2026-07"), 4);
  assert.equal(proRatedQuota(5, "2026-10"), 1);   // 5 * 3/12 = 1.25
  assert.equal(proRatedQuota(8, "2026-12"), 0.5); // 0.67
});

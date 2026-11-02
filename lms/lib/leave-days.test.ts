import { test } from "node:test";
import assert from "node:assert/strict";
import { countLeaveDays, type DayCountOptions } from "./leave-days.ts";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditTask, canMoveTask, canViewTask, dueGroup, dueLabel, initials } from "./task-rules.ts";

test("dueGroup buckets by due date", () => {
  const today = "2026-11-12";
  assert.equal(dueGroup(null, today), "No due date");
  assert.equal(dueGroup("2026-11-11", today), "Overdue");
  assert.equal(dueGroup("2026-11-12", today), "Today");
  assert.equal(dueGroup("2026-11-19", today), "This week");
  assert.equal(dueGroup("2026-11-20", today), "Later");
});

test("dueLabel and initials", () => {
  assert.equal(dueLabel("2026-11-13", "2026-11-12"), "Tomorrow");
  assert.equal(dueLabel("2026-12-01", "2026-11-12"), "Dec 1");
  assert.equal(initials("Karan  Dev Singh"), "KD");
});

test("task permissions", () => {
  const task = { createdById: 1, assigneeId: 2, departmentId: 10 };
  const emp = (id: number) => ({ id, role: "EMPLOYEE" as const, departmentId: 10 });
  assert.equal(canEditTask(emp(1), task), true, "creator edits");
  assert.equal(canEditTask(emp(2), task), false, "assignee cannot fully edit");
  assert.equal(canMoveTask(emp(2), task), true, "assignee moves");
  assert.equal(canMoveTask(emp(3), task), false, "teammate cannot move");
  assert.equal(canEditTask({ id: 4, role: "LEAD", departmentId: 10 }, task), true, "team lead edits");
  assert.equal(canEditTask({ id: 5, role: "LEAD", departmentId: 11 }, task), false, "other lead cannot");
  assert.equal(canEditTask({ id: 6, role: "ADMIN", departmentId: null }, task), true);
});

test("task visibility is per team", () => {
  const t = { createdById: 9, assigneeId: null, departmentId: 1 };
  assert.equal(canViewTask({ id: 1, role: "ADMIN", departmentId: 2 }, t), true);
  assert.equal(canViewTask({ id: 2, role: "EMPLOYEE", departmentId: 1 }, t), true);
  assert.equal(canViewTask({ id: 3, role: "EMPLOYEE", departmentId: 2 }, t), false);
  assert.equal(canViewTask({ id: 4, role: "LEAD", departmentId: 2 }, t), false);
  assert.equal(canViewTask({ id: 5, role: "EMPLOYEE", departmentId: null }, { ...t, assigneeId: 5 }), true);
});

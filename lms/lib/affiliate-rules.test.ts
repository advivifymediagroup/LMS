import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedMoves, canEditRecord, fileType, MOVES, STATUSES } from "./affiliate-rules.ts";

const team = { admin: false, finance: false, team: true };
const finance = { admin: false, finance: true, team: false };
const admin = { admin: true, finance: false, team: false };
const to = (ms: { to: string }[]) => ms.map((x) => x.to);

test("every move stays inside its side's statuses", () => {
  for (const side of ["SALES", "DELIVERY"] as const)
    for (const [from, moves] of Object.entries(MOVES[side])) {
      assert.ok(STATUSES[side].includes(from as never), `${side} ${from}`);
      for (const mv of moves!) assert.ok(STATUSES[side].includes(mv.to), `${side} ${from}→${mv.to}`);
    }
});

test("teams submit, Finance approves and pays", () => {
  assert.deepEqual(to(allowedMoves("SALES", "DRAFT", team)), ["SUBMITTED"]);
  assert.deepEqual(to(allowedMoves("SALES", "DRAFT", finance)), []);
  assert.ok(!to(allowedMoves("SALES", "SUBMITTED", team)).includes("APPROVED"));
  assert.ok(to(allowedMoves("SALES", "SUBMITTED", finance)).includes("APPROVED"));
  assert.deepEqual(to(allowedMoves("DELIVERY", "PAYMENT_PENDING", team)), []);
  assert.deepEqual(to(allowedMoves("DELIVERY", "PAYMENT_PENDING", finance)), ["PAID"]);
  assert.deepEqual(to(allowedMoves("DELIVERY", "PAYMENT_PENDING", admin)), ["PAID"]);
  assert.deepEqual(to(allowedMoves("DELIVERY", "CLOSED", admin)), []);
});

test("approved records are locked for the team, not for admins", () => {
  assert.ok(canEditRecord("SALES", "DRAFT", team));
  assert.ok(!canEditRecord("SALES", "APPROVED", team));
  assert.ok(!canEditRecord("SALES", "DRAFT", finance));
  assert.ok(canEditRecord("DELIVERY", "PAID", admin));
});

test("fileType checks the bytes, not just the name", () => {
  const b = (...x: number[]) => new Uint8Array(x);
  assert.equal(fileType("r.pdf", b(0x25, 0x50, 0x44, 0x46, 0x2d)), "application/pdf");
  assert.equal(fileType("r.pdf", b(0x50, 0x4b, 3, 4)), null);
  assert.ok(fileType("r.XLSX", b(0x50, 0x4b, 3, 4))?.includes("spreadsheetml"));
  assert.equal(fileType("r.csv", b(0x61, 0x2c, 0x62)), "text/csv");
  assert.equal(fileType("r.csv", b(0x61, 0, 0x62)), null);
  assert.equal(fileType("r.exe", b(0x4d, 0x5a)), null);
});

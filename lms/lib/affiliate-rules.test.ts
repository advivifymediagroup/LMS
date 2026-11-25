import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedMoves, bucket, canEditRecord, fileType, IMPORT_COLUMNS, MOVES, needsRevision, normDate, normMonth, NOTIFY, payment, readSheet, reconcile, REVISABLE, STATUSES, UNRESOLVED, type MoneyRow } from "./affiliate-rules.ts";

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
  assert.ok(!canEditRecord("SALES", "UNDER_REVIEW", team));
  assert.ok(!canEditRecord("SALES", "DRAFT", finance));
  assert.ok(canEditRecord("DELIVERY", "PAID", admin));
});

test("approved records change only by revision; paid ones only by an admin", () => {
  assert.ok(canEditRecord("SALES", "APPROVED", team) && needsRevision("SALES", "APPROVED"));
  assert.ok(!needsRevision("SALES", "SUBMITTED"));
  assert.ok(!canEditRecord("DELIVERY", "PAID", team) && needsRevision("DELIVERY", "PAID"));
  assert.ok(!canEditRecord("SALES", "CLOSED", team));
  for (const side of ["SALES", "DELIVERY"] as const) for (const s of REVISABLE[side]) assert.ok(needsRevision(side, s), `${side} ${s}`);
});

test("reconciliation: TRD example, partial approvals, pending kept apart, currencies never mixed", () => {
  const row = (side: "SALES" | "DELIVERY", status: string, net: number, extra: Partial<MoneyRow> = {}): MoneyRow => ({
    side, status: status as never, campaignId: 1, month: "2026-10", geo: "US", currency: "USD",
    publisherId: side === "DELIVERY" ? 1 : null, netAmount: net, approvedAmount: null, approvedConversions: 10, ...extra,
  });
  const [g, eur] = reconcile([
    row("SALES", "PARTIALLY_APPROVED", 6000, { approvedAmount: 5000 }),
    row("DELIVERY", "APPROVED", 1200, { publisherId: 1 }),
    row("DELIVERY", "PAID", 900, { publisherId: 2 }),
    row("DELIVERY", "INVOICE_RECEIVED", 750, { publisherId: 3 }),
    row("DELIVERY", "SENT_TO_PUBLISHER", 400, { publisherId: 3 }),
    row("DELIVERY", "DRAFT", 99),
    row("SALES", "APPROVED", 100, { currency: "EUR" }),
  ]);
  assert.equal(g.revenue.approved, 5000);
  assert.equal(g.cost.approved, 2850);
  assert.equal(g.cost.pending, 400);
  assert.equal(g.cost.draft, 99);
  assert.equal(g.margin, 2150);
  assert.equal(g.marginPct, 43);
  assert.deepEqual(g.publishers.get(3), { approved: 750, open: 400 });
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.margin, 100);
  assert.equal(payment("PAYMENT_PENDING"), "due");
  assert.equal(payment("SENT_TO_PUBLISHER"), "not_due");
  assert.equal(bucket("SALES", "UNDER_REVIEW"), "pending");
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

test("import: Excel's month and date spellings are normalised", () => {
  for (const v of ["2026-11", "2026-11-01", "11/2026", "Nov-26", "Nov 2026", "November 2026", "01/11/2026", "2026/11"]) assert.equal(normMonth(v), "2026-11", v);
  assert.equal(normMonth("Foo 2026"), "Foo 2026");
  assert.equal(normDate("05/11/2026"), "2026-11-05");
  assert.equal(normDate("5.1.2026"), "2026-01-05");
  assert.equal(normDate("2026-1-5"), "2026-01-05");
});

test("import: header row matched loosely, values tidied, missing columns named", () => {
  const head = IMPORT_COLUMNS.SALES.map((c) => c.header.toUpperCase() + " *");
  const r = readSheet("SALES", [head, IMPORT_COLUMNS.SALES.map((c) => c.example).map((v, i) => (i === 10 ? "5,750" : i === 12 ? "usd" : v))]);
  assert.ok("lines" in r);
  assert.equal(r.lines[0].line, 2);
  assert.deepEqual([r.lines[0].values.amount, r.lines[0].values.currency, r.lines[0].values.platform], ["5750", "USD", "ANDROID"]);
  const bad = readSheet("DELIVERY", [["Month", "Client", "Campaign"], ["2026-11", "a", "b"]]);
  assert.ok("error" in bad && bad.error.includes("Publisher") && bad.error.includes("Currency"));
  assert.ok("error" in readSheet("SALES", [head]));
});

test("notifications only name real statuses; unresolved excludes final ones", () => {
  for (const side of ["SALES", "DELIVERY"] as const) for (const s of Object.keys(NOTIFY[side])) assert.ok(STATUSES[side].includes(s as never), s);
  assert.ok(!UNRESOLVED.DELIVERY.includes("PAID") && UNRESOLVED.DELIVERY.includes("PAYMENT_PENDING"));
  assert.ok(!UNRESOLVED.SALES.includes("APPROVED"));
});

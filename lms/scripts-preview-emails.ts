// Dev only: sends every portal email to Mailpit (http://localhost:8025) using sample leave rows, then cleans up.
import { db } from "./lib/db";
import { sendMail } from "./lib/mail";
import { notifyApplied, notifyCancelled, notifyDecision, sendPasswordReset, sendPendingReminders, testEmail } from "./lib/notify";

async function main() {
const original = await db.setting.findUnique({ where: { key: "smtp" } });
await db.setting.update({ where: { key: "smtp" }, data: { value: { host: "localhost", port: 1025, secure: false, user: "", pass: "", from: "Advivify Portal <portal@localhost>" } } });
const made: number[] = [];
try {
  const [karan, neha, lead] = await Promise.all(["EMP001", "EMP002", "LEAD001"].map((employeeId) => db.user.findUniqueOrThrow({ where: { employeeId } })));
  const cl = await db.leaveType.findUniqueOrThrow({ where: { code: "CL" } });
  const d = (s: string) => new Date(s + "T00:00:00Z");
  const leave = (userId: number, start: string, end: string, days: number, extra = {}) =>
    db.leaveRequest.create({ data: { userId, leaveTypeId: cl.id, startDate: d(start), endDate: d(end), days, reason: "Family function in Jaipur", note: "Handover to Neha for the checkout fix.", status: "PENDING", ...extra } }).then((l) => (made.push(l.id), l));

  await leave(neha.id, "2026-12-08", "2026-12-08", 1); // overlaps, for the coverage line
  const a = await leave(karan.id, "2026-12-07", "2026-12-09", 3);
  await notifyApplied(a.id);
  await sendPendingReminders();
  await db.leaveRequest.update({ where: { id: a.id }, data: { status: "APPROVED", approverId: lead.id, decidedAt: new Date() } });
  await notifyDecision(a.id);
  const r = await leave(karan.id, "2026-12-21", "2026-12-21", 0.5, { startHalf: "FIRST", endHalf: "FIRST", status: "REJECTED", approverId: lead.id, decidedAt: new Date(), decisionReason: "Year-end release that morning; can you take the afternoon instead?" });
  await notifyDecision(r.id);
  await notifyCancelled(a.id, true);
  await sendPasswordReset(karan, "http://localhost:3000/reset-password?token=sample");
  await sendMail(testEmail("admin@example.com"));
} finally {
  await db.leaveRequest.deleteMany({ where: { id: { in: made } } });
  if (original) await db.setting.update({ where: { key: "smtp" }, data: { value: original.value as object } });
  await db.$disconnect();
}
console.log("sent; see http://localhost:8025");
}
main();

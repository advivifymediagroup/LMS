import type { LeaveRequest, LeaveType, User } from "@prisma/client";
import { db } from "./db";
import { approversFor, getSetting } from "./leave";
import { describeDates, toIso } from "./leave-days";
import { sendMailSafe } from "./mail";

type Leave = LeaveRequest & { user: User; leaveType: LeaveType; approver: User | null };

export const appUrl = (path: string) => `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;

const load = (id: number) =>
  db.leaveRequest.findUniqueOrThrow({ where: { id }, include: { user: true, leaveType: true, approver: true } });

const dates = (l: Leave) => describeDates(toIso(l.startDate), toIso(l.endDate), l.startHalf, l.endHalf);

// Policy: the leave type goes in the subject line, and half days say which half.
const subject = (l: Leave, what: string) => `${l.leaveType.name} ${what}: ${l.user.name}, ${dates(l)}`;

function details(l: Leave) {
  return [
    `Employee: ${l.user.name} (${l.user.employeeId})`,
    `Leave type: ${l.leaveType.name}`,
    `Dates: ${dates(l)}`,
    `Days: ${Number(l.days)}`,
    `Reason: ${l.reason}`,
    ...(l.note ? [`Note: ${l.note}`] : []),
  ].join("\n");
}

const alwaysNotify = () => getSetting<string[]>("notifyAlways", []);

/** New request → approver(s) + HR/Finance, team members in CC. */
export async function notifyApplied(id: number) {
  const l = await load(id);
  const approvers = await approversFor(l.user);
  const auto = l.status === "APPROVED";
  await sendMailSafe({
    to: [...approvers.map((a) => a.email), ...(await alwaysNotify())],
    cc: l.ccEmails,
    subject: subject(l, auto ? "(auto-approved)" : "request"),
    text: `${details(l)}\n\n${auto ? "This leave was approved automatically." : `Review it: ${appUrl("/approvals")}`}`,
  });
}

/** Approved / rejected → employee; HR/Finance copied; team copied only when approved. */
export async function notifyDecision(id: number) {
  const l = await load(id);
  const approved = l.status === "APPROVED";
  await sendMailSafe({
    to: [l.user.email],
    cc: [...(await alwaysNotify()), ...(approved ? l.ccEmails : [])],
    subject: subject(l, approved ? "approved" : "rejected"),
    text: [
      `Your leave was ${approved ? "approved" : "rejected"} by ${l.approver?.name ?? "an admin"}.`,
      ...(l.decisionReason ? [`Comment: ${l.decisionReason}`] : []),
      "",
      details(l),
      "",
      appUrl(`/leaves/${l.id}`),
    ].join("\n"),
  });
}

/** Cancelled → approver(s) + HR/Finance; team copied if it had been approved. */
export async function notifyCancelled(id: number, wasApproved: boolean) {
  const l = await load(id);
  const approvers = await approversFor(l.user);
  await sendMailSafe({
    to: [...approvers.map((a) => a.email), ...(await alwaysNotify())],
    cc: wasApproved ? l.ccEmails : [],
    subject: subject(l, "cancelled"),
    text: `${l.user.name} cancelled this ${wasApproved ? "approved" : "pending"} leave.\n\n${details(l)}`,
  });
}

/** One digest per approver listing what's waiting. Returns how many emails went out. */
export async function sendPendingReminders() {
  const pending = await db.leaveRequest.findMany({
    where: { status: "PENDING" },
    include: { user: true, leaveType: true, approver: true },
    orderBy: { startDate: "asc" },
  });
  const byApprover = new Map<string, { name: string; leaves: Leave[] }>();
  for (const l of pending) {
    for (const a of await approversFor(l.user)) {
      const entry = byApprover.get(a.email) ?? { name: a.name, leaves: [] };
      entry.leaves.push(l);
      byApprover.set(a.email, entry);
    }
  }
  for (const [email, { name, leaves }] of byApprover) {
    await sendMailSafe({
      to: [email],
      subject: `${leaves.length} leave request(s) waiting for your approval`,
      text: [
        `Hi ${name.split(" ")[0]},`,
        "",
        ...leaves.map((l) => `- ${l.user.name}: ${l.leaveType.name}, ${dates(l)} (${Number(l.days)} day(s))`),
        "",
        `Review them: ${appUrl("/approvals")}`,
      ].join("\n"),
    });
  }
  return byApprover.size;
}

export async function sendPasswordReset(user: User, url: string) {
  await sendMailSafe({
    to: [user.email],
    subject: "Reset your Leave Management password",
    text: `Hi ${user.name.split(" ")[0]},\n\nUse this link within 1 hour to set a new password:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
  });
}

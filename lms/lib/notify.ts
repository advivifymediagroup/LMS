import type { User } from "@prisma/client";
import { db } from "./db";
import { renderEmail, type EmailContent } from "./email";
import { approversFor, getBalances, getSetting } from "./leave";
import { describeDates, toIso } from "./leave-days";
import { sendMailSafe } from "./mail";

export const appUrl = (path: string) => `${process.env.APP_URL ?? "http://localhost:3000"}${path}`;

const load = (id: number) =>
  db.leaveRequest.findUniqueOrThrow({ where: { id }, include: { user: { include: { department: true } }, leaveType: true, approver: true } });
type Leave = Awaited<ReturnType<typeof load>>;

const dates = (l: Pick<Leave, "startDate" | "endDate" | "startHalf" | "endHalf">) => describeDates(toIso(l.startDate), toIso(l.endDate), l.startHalf, l.endHalf);
const first = (name: string) => name.split(" ")[0];
const dayCount = (n: unknown) => `${Number(n)} day${Number(n) === 1 ? "" : "s"}`;

// "Mon, 24 Nov 2026", with the half-day noted, for the HTML emails.
const pretty = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
function prettyDates(l: Leave) {
  const half = (h: string) => (h === "FIRST" ? " (first half)" : h === "SECOND" ? " (second half)" : "");
  const [s, e] = [toIso(l.startDate), toIso(l.endDate)];
  return s === e ? pretty(l.startDate) + half(l.startHalf) : `${pretty(l.startDate)}${half(l.startHalf)} – ${pretty(l.endDate)}${half(l.endHalf)}`;
}
const team = (l: Leave) => l.user.department?.name;
const who = (l: Leave) => ({ name: l.user.name, sub: [l.user.employeeId, team(l)].filter(Boolean).join(" · ") });

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

function rows(l: Leave, extra: [string, string][] = []): [string, string][] {
  return [
    ["Leave type", l.leaveType.name],
    ["Dates", prettyDates(l)],
    ["Working days", dayCount(l.days)],
    ...extra,
    ["Reason", l.reason],
    ...(l.note ? [["Note", l.note] as [string, string]] : []),
  ];
}

/** Teammates already off (approved or pending) on any of these days. */
async function coverage(l: Leave): Promise<[string, string] | undefined> {
  if (!l.user.departmentId) return undefined;
  const others = await db.leaveRequest.findMany({
    where: {
      id: { not: l.id }, userId: { not: l.userId }, status: { in: ["APPROVED", "PENDING"] },
      user: { departmentId: l.user.departmentId }, startDate: { lte: l.endDate }, endDate: { gte: l.startDate },
    },
    include: { user: true },
  });
  const names = [...new Set(others.map((o) => o.user.name))];
  return ["Team coverage:", names.length ? `Also off in ${team(l)} during these dates: ${names.join(", ")}.` : `No other ${team(l)} members are off during these dates.`];
}

const alwaysNotify = () => getSetting<string[]>("notifyAlways", []);
const send = (msg: { to: string[]; cc?: string[]; subject: string; text: string }, html: EmailContent) =>
  sendMailSafe({ ...msg, html: renderEmail(html) });

/** New request → approver(s) + HR/Finance, team members in CC. */
export async function notifyApplied(id: number) {
  const l = await load(id);
  const approvers = await approversFor(l.user);
  const auto = l.status === "APPROVED";
  const bal = l.leaveType.needsBalance ? (await getBalances(l.userId, l.id)).find((b) => b.type.id === l.leaveTypeId) : undefined;
  const after = bal && !auto ? [["Balance after approval", `${bal.available - Number(l.days)} days`] as [string, string]] : [];
  await send(
    {
      to: [...approvers.map((a) => a.email), ...(await alwaysNotify())],
      cc: l.ccEmails,
      subject: subject(l, auto ? "(auto-approved)" : "request"),
      text: `${details(l)}\n\n${auto ? "This leave was approved automatically." : `Review it: ${appUrl("/leave")}`}`,
    },
    {
      preheader: `${l.user.name} ${auto ? "is taking" : "requested"} ${dayCount(l.days)} of ${l.leaveType.name}, ${prettyDates(l)}.`,
      eyebrow: auto ? "For your information" : "Action needed",
      title: auto ? "Leave approved automatically" : "Leave request awaiting approval",
      intro: auto
        ? `${l.user.name}${team(l) ? ` from ${team(l)}` : ""} has booked ${l.leaveType.name}. It needed no approval, so it is already confirmed.`
        : `${l.user.name}${team(l) ? ` from ${team(l)}` : ""} has requested ${l.leaveType.name}. Please approve or decline it in the portal.`,
      person: { ...who(l), pill: auto ? { text: "Approved", tone: "approved" } : { text: "Pending", tone: "pending" } },
      rows: rows(l, after),
      callout: await coverage(l),
      buttons: auto ? [{ label: "View in portal", href: appUrl("/leave"), primary: true }] : [{ label: "Review request", href: appUrl("/leave"), primary: true }, { label: "Open approvals", href: appUrl("/approvals") }],
      fine: auto ? undefined : "Approve with one click from the Leave page, or decline with a reason.",
      footer: "You're receiving this because you approve leave for this employee, or HR and Finance are copied on all leave.",
    },
  );
}

/** Approved / rejected → employee; HR/Finance copied; team copied only when approved. */
export async function notifyDecision(id: number) {
  const l = await load(id);
  const approved = l.status === "APPROVED";
  const by = l.approver?.name ?? "an admin";
  await send(
    {
      to: [l.user.email],
      cc: [...(await alwaysNotify()), ...(approved ? l.ccEmails : [])],
      subject: subject(l, approved ? "approved" : "rejected"),
      text: [
        `Your leave was ${approved ? "approved" : "rejected"} by ${by}.`,
        ...(l.decisionReason ? [`Comment: ${l.decisionReason}`] : []),
        "",
        details(l),
        "",
        appUrl(`/leaves/${l.id}`),
      ].join("\n"),
    },
    {
      preheader: `Your ${l.leaveType.name} for ${prettyDates(l)} was ${approved ? "approved" : "declined"} by ${by}.`,
      eyebrow: approved ? "Approved" : "Declined",
      title: approved ? "Your leave is approved" : "Your leave request was declined",
      intro: approved
        ? `Hi ${first(l.user.name)}, ${by} approved your ${l.leaveType.name}. Enjoy your time off.`
        : `Hi ${first(l.user.name)}, ${by} declined your ${l.leaveType.name} request.${l.decisionReason ? "" : " Speak to them if you'd like to discuss it."}`,
      person: { ...who(l), pill: approved ? { text: "Approved", tone: "approved" } : { text: "Declined", tone: "rejected" } },
      rows: rows(l, [["Decided by", by]]),
      callout: l.decisionReason ? ["Comment:", l.decisionReason] : undefined,
      buttons: [{ label: "View request", href: appUrl(`/leaves/${l.id}`), primary: true }, ...(approved ? [] : [{ label: "Apply again", href: appUrl("/leave#apply") }])],
      footer: "You're receiving this because you applied for this leave, or you are copied on it.",
    },
  );
}

/** Cancelled → approver(s) + HR/Finance; team copied if it had been approved. */
export async function notifyCancelled(id: number, wasApproved: boolean) {
  const l = await load(id);
  const approvers = await approversFor(l.user);
  await send(
    {
      to: [...approvers.map((a) => a.email), ...(await alwaysNotify())],
      cc: wasApproved ? l.ccEmails : [],
      subject: subject(l, "cancelled"),
      text: `${l.user.name} cancelled this ${wasApproved ? "approved" : "pending"} leave.\n\n${details(l)}`,
    },
    {
      preheader: `${l.user.name} cancelled ${l.leaveType.name} for ${prettyDates(l)}.`,
      eyebrow: "Cancelled",
      title: "Leave cancelled",
      intro: `${l.user.name} cancelled this ${wasApproved ? "approved" : "pending"} leave.${wasApproved ? " They will be working on these dates after all." : " There is nothing left to approve."}`,
      person: { ...who(l), pill: { text: "Cancelled", tone: "neutral" } },
      rows: rows(l),
      buttons: [{ label: "Open the leave calendar", href: appUrl("/calendar") }],
      footer: "You're receiving this because you approve leave for this employee, or you were copied on the original request.",
    },
  );
}

/** One digest per approver listing what's waiting. Returns how many emails went out. */
export async function sendPendingReminders() {
  const pending = await db.leaveRequest.findMany({
    where: { status: "PENDING" },
    include: { user: { include: { department: true } }, leaveType: true, approver: true },
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
    const n = leaves.length;
    await send(
      {
        to: [email],
        subject: `${n} leave request(s) waiting for your approval`,
        text: [
          `Hi ${first(name)},`,
          "",
          ...leaves.map((l) => `- ${l.user.name}: ${l.leaveType.name}, ${dates(l)} (${Number(l.days)} day(s))`),
          "",
          `Review them: ${appUrl("/leave")}`,
        ].join("\n"),
      },
      {
        preheader: `${n} leave request${n === 1 ? " is" : "s are"} waiting for you.`,
        eyebrow: "Daily reminder",
        title: `${n} request${n === 1 ? "" : "s"} waiting for your approval`,
        intro: `Hi ${first(name)}, these leave requests are still pending. Please review them so your team can plan.`,
        list: leaves.map((l) => ({ title: `${l.user.name}${team(l) ? ` · ${team(l)}` : ""}`, sub: `${l.leaveType.name} · ${prettyDates(l)} · ${dayCount(l.days)}` })),
        buttons: [{ label: "Review requests", href: appUrl("/leave"), primary: true }],
        footer: "You're receiving this daily while leave requests are waiting for your approval.",
      },
    );
  }
  return byApprover.size;
}

export async function sendPasswordReset(user: User, url: string) {
  await send(
    {
      to: [user.email],
      subject: "Reset your Advivify Portal password",
      text: `Hi ${first(user.name)},\n\nUse this link within 1 hour to set a new password:\n${url}\n\nIf you didn't ask for this, ignore this email.`,
    },
    {
      preheader: "Use this link within 1 hour to set a new password.",
      eyebrow: "Account",
      title: "Reset your password",
      intro: `Hi ${first(user.name)}, we received a request to reset the password for ${user.employeeId}. The link works once and expires in 1 hour.`,
      buttons: [{ label: "Set a new password", href: url, primary: true }],
      fine: `If you didn't ask for this, you can ignore this email; your password won't change. Button not working? Paste this into your browser: ${url}`,
      footer: "You're receiving this because a password reset was requested for your account.",
    },
  );
}

/** Admin → Settings "Send test email". Throws, so the admin sees SMTP errors. */
export const testEmail = (to: string) => ({
  to: [to],
  subject: "Advivify Portal test email",
  text: "SMTP settings work.",
  html: renderEmail({
    preheader: "Your email settings work.",
    eyebrow: "Settings",
    title: "Email is working",
    intro: "This test came from the Advivify Portal, so leave requests, approvals, reminders and password resets will now be delivered.",
    buttons: [{ label: "Open the portal", href: appUrl("/dashboard"), primary: true }],
    footer: "You're receiving this because you sent a test from Admin → Settings.",
  }),
});

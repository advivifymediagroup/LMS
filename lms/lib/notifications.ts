// In-portal notifications for Affiliate Operations (no email: the TRD asks for them inside Advivify).
import type { Validation } from "@prisma/client";
import { db } from "./db";
import { NOTIFY, SIDES, STATUS_LABEL, UNRESOLVED, type Audience, type Side, type Status } from "./affiliate-rules";
import { FINANCE_TEAM } from "./finance";
import { getSetting } from "./leave";

type Note = { title: string; body?: string; href: string; key?: string };

/** Sends to each user once. With a `key`, a user who already has that key gets nothing (reminders). */
export async function notify(userIds: number[], n: Note) {
  const ids = [...new Set(userIds)];
  return ids.length ? (await db.notification.createMany({ data: ids.map((userId) => ({ userId, ...n })), skipDuplicates: true })).count : 0;
}

const financeIds = async () =>
  (await db.user.findMany({ where: { isActive: true, department: { name: FINANCE_TEAM } }, select: { id: true } })).map((u) => u.id);

/** Users in these audiences for a record, minus whoever caused it. */
async function audience(who: Audience[], v: Pick<Validation, "createdById">, actorId: number | null, actorIsFinance: boolean) {
  const ids = [
    ...(who.includes("owner") ? [v.createdById] : []),
    ...(who.includes("finance") && !actorIsFinance ? await financeIds() : []),
  ];
  return ids.filter((id) => id !== actorId);
}

const label = (v: Validation & { campaign: { name: string; advertiser: { name: string } }; publisher: { name: string } | null }) =>
  [v.campaign.advertiser.name, v.campaign.name, v.publisher?.name, v.month].filter(Boolean).join(" · ");
const load = (id: number) => db.validation.findUniqueOrThrow({ where: { id }, include: { campaign: { include: { advertiser: true } }, publisher: true } });
export const recordHref = (v: Pick<Validation, "id" | "side">) => `/affiliate/${SIDES[v.side].slug}/${v.id}`;

/** A record reached a new status: tell whoever acts next. Never throws; a failed notification must not undo the change. */
export async function notifyStatus(id: number, by: { id: number; name: string; finance: boolean }, note?: string | null) {
  try {
    const v = await load(id);
    const who = NOTIFY[v.side][v.status];
    if (!who) return;
    await notify(await audience(who, v, by.id, by.finance), {
      title: `${STATUS_LABEL[v.status]}: ${v.number}`,
      body: `${label(v)}. By ${by.name}.${note ? ` “${note.slice(0, 300)}”` : ""}`,
      href: recordHref(v),
    });
  } catch (e) {
    console.error("[notify]", e);
  }
}

/** One notification to Finance for a whole bulk upload. */
export async function notifyImport(side: Side, count: number, importId: string, by: { id: number; name: string; finance: boolean }, submitted: boolean) {
  try {
    if (by.finance || !submitted) return;
    await notify((await financeIds()).filter((id) => id !== by.id), {
      title: `${count} ${SIDES[side].label} validation${count === 1 ? "" : "s"} uploaded for review`,
      body: `Bulk upload ${importId} by ${by.name}.`,
      href: `/affiliate/${SIDES[side].slug}?status=SUBMITTED`,
    });
  } catch (e) {
    console.error("[notify]", e);
  }
}

/**
 * Reminders (returns how many were created) for records that sit unresolved longer than the configured number of days, and for
 * publishers that haven't acknowledged. One per record per window, so running it hourly is fine.
 */
export async function runAffiliateReminders() {
  const days = Math.max(1, Number(await getSetting("validationReminderDays", 7)) || 7);
  const cutoff = new Date(Date.now() - days * 86_400_000);
  // ponytail: up to 2000 stale records per run; the rest get picked up on later runs once these are dealt with.
  const stale = await db.validation.findMany({
    where: {
      OR: (["SALES", "DELIVERY"] as const).map((side) => ({ side, status: { in: UNRESOLVED[side] } })),
      AND: [{ OR: [{ status: "SENT_TO_PUBLISHER", sentDate: { lt: cutoff } }, { status: { not: "SENT_TO_PUBLISHER" }, updatedAt: { lt: cutoff } }] }],
    },
    include: { campaign: { include: { advertiser: true } }, publisher: true },
    take: 2000,
  });
  const finance = stale.length ? await financeIds() : [];
  let sent = 0;
  for (const v of stale) {
    const since = v.status === "SENT_TO_PUBLISHER" && v.sentDate ? v.sentDate : v.updatedAt;
    const age = Math.floor((Date.now() - since.getTime()) / 86_400_000);
    const who = NOTIFY[v.side][v.status as Status] ?? [];
    const ids = [v.createdById, ...(who.includes("finance") ? finance : [])];
    const ack = v.status === "SENT_TO_PUBLISHER";
    sent += await notify(ids, {
      title: ack ? `Publisher hasn't acknowledged: ${v.number}` : `${STATUS_LABEL[v.status]} for ${age} days: ${v.number}`,
      body: `${label(v)}. ${ack ? `Sent ${age} days ago.` : `No change in ${age} days.`}`,
      href: recordHref(v),
      key: `stale:${v.id}:${v.status}:${Math.floor(age / days)}`,
    });
  }
  return sent;
}

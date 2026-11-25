import type { Prisma, User, ValidationStatus } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { OFFER_MODELS, PAYMENT_STATUSES, SIDES, STATUSES, type Actor, type Payment, type Side } from "./affiliate-rules";
import { requireUser } from "./auth";
import { db } from "./db";
import { FINANCE_TEAM } from "./finance";
import { todayIso } from "./leave";

export type AffiliateAccess = {
  user: User;
  admin: boolean;
  finance: boolean;
  /** Sales or Delivery team this person belongs to, if any. */
  side: Side | null;
  /** Leadership sees everything read-only. */
  leadership: boolean;
};

export async function affiliateAccess(user: User): Promise<AffiliateAccess> {
  const team = user.departmentId ? (await db.department.findUnique({ where: { id: user.departmentId } }))?.name : undefined;
  return {
    user,
    admin: user.role === "ADMIN",
    finance: team === FINANCE_TEAM,
    side: team === SIDES.SALES.team ? "SALES" : team === SIDES.DELIVERY.team ? "DELIVERY" : null,
    leadership: team === "Leadership",
  };
}

export const canViewSide = (a: AffiliateAccess, side: Side) => a.admin || a.finance || a.leadership || a.side === side;
export const inAffiliate = (a: AffiliateAccess) => a.admin || a.finance || a.leadership || a.side !== null;
/** Who may add advertisers, campaigns and publishers. */
export const canManageDirectory = (a: AffiliateAccess) => a.admin || a.finance || a.side !== null;
export const actorFor = (a: AffiliateAccess, side: Side): Actor => ({ admin: a.admin, finance: a.finance, team: a.side === side });

/** For pages: signed in and allowed into this side (or the section when no side), else away. */
export async function requireAffiliate(side?: Side) {
  const a = await affiliateAccess(await requireUser());
  if (side ? !canViewSide(a, side) : !inAffiliate(a)) redirect("/dashboard");
  return a;
}

/** A validation the person may view, or 404. */
export async function getValidation(a: AffiliateAccess, id: number) {
  const v = Number.isInteger(id)
    ? await db.validation.findUnique({
        where: { id },
        include: { campaign: { include: { advertiser: true } }, publisher: true, createdBy: true, files: { omit: { data: true }, include: { uploadedBy: true }, orderBy: { createdAt: "desc" } } },
      })
    : null;
  if (!v || !canViewSide(a, v.side)) notFound();
  return v;
}

/** Next number in the SV-YYYY-0001 / DV-YYYY-0001 series. */
export async function nextValidationNumber(side: Side, today: string) {
  const prefix = `${SIDES[side].prefix}-${today.slice(0, 4)}-`;
  const last = await db.validation.findFirst({ where: { number: { startsWith: prefix } }, orderBy: { number: "desc" } });
  const n = last ? Number(last.number.slice(prefix.length)) + 1 || 1 : 1;
  return prefix + String(n).padStart(4, "0");
}

type Query = Record<string, string | string[] | undefined>;
const param = (q: Query, k: string) => (typeof q[k] === "string" ? (q[k] as string).trim() : "");

/** The validations list's filters (month, status, search), shared by the page and its CSV export. */
export function listFilter(side: Side, q: Query) {
  const month = /^\d{4}-\d{2}$/.test(param(q, "month")) ? param(q, "month") : "";
  const status = STATUSES[side].includes(param(q, "status") as ValidationStatus) ? (param(q, "status") as ValidationStatus) : "";
  const search = param(q, "q");
  const where: Prisma.ValidationWhereInput = {
    side,
    ...(month && { month }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { importId: { contains: search, mode: "insensitive" } },
        { campaign: { name: { contains: search, mode: "insensitive" } } },
        { campaign: { advertiser: { name: { contains: search, mode: "insensitive" } } } },
        { publisher: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };
  return { month, status, search, where };
}

/** Overview filters (TRD section 7). `filters` is everything except the period, for the trend. */
export async function overviewFilter(q: Query) {
  const id = (k: string) => (/^\d+$/.test(param(q, k)) ? Number(param(q, k)) : undefined);
  // Period: a month, a whole year, or (by default) the latest month with any record.
  const year = /^\d{4}$/.test(param(q, "year")) ? param(q, "year") : "";
  let month = /^\d{4}-\d{2}$/.test(param(q, "month")) ? param(q, "month") : "";
  if (!month && !year && param(q, "month") !== "all")
    month = (await db.validation.findFirst({ orderBy: { month: "desc" }, select: { month: true } }))?.month ?? (await todayIso()).slice(0, 7);
  const statuses = [...new Set([...STATUSES.SALES, ...STATUSES.DELIVERY])];
  const f = {
    advertiser: id("advertiser"), campaign: id("campaign"), publisher: id("publisher"), salesOwner: id("salesOwner"), deliveryOwner: id("deliveryOwner"),
    geo: param(q, "geo").toUpperCase(), offerModel: OFFER_MODELS.includes(param(q, "offerModel") as never) ? (param(q, "offerModel") as (typeof OFFER_MODELS)[number]) : undefined,
    status: statuses.includes(param(q, "status") as ValidationStatus) ? (param(q, "status") as ValidationStatus) : undefined,
    payment: param(q, "payment") in PAYMENT_STATUSES ? (param(q, "payment") as Payment) : undefined,
  };
  // Publisher, Delivery owner and payment filters only narrow the Delivery side; Sales owner only the Sales side.
  const filters: Prisma.ValidationWhereInput[] = [
    f.advertiser ? { campaign: { advertiserId: f.advertiser } } : {},
    f.campaign ? { campaignId: f.campaign } : {},
    f.geo ? { geo: f.geo } : {},
    f.offerModel ? { offerModel: f.offerModel } : {},
    f.status ? { status: f.status } : {},
    f.salesOwner ? { OR: [{ side: "DELIVERY" }, { createdById: f.salesOwner }] } : {},
    f.publisher ? { OR: [{ side: "SALES" }, { publisherId: f.publisher }] } : {},
    f.deliveryOwner ? { OR: [{ side: "SALES" }, { createdById: f.deliveryOwner }] } : {},
    f.payment ? { OR: [{ side: "SALES" }, { status: { in: PAYMENT_STATUSES[f.payment] } }] } : {},
  ];
  const where: Prisma.ValidationWhereInput = { AND: [month ? { month } : year ? { month: { startsWith: `${year}-` } } : {}, ...filters] };
  return { month, year, f, filters, where, period: month || (year ? `Year ${year}` : "All time") };
}

/** "2026-11" + n months. */
export function shiftMonth(m: string, n: number) {
  const d = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export const ACTIVITY_ACTIONS: [string, string][] = [
  ["CREATE", "Created"], ["IMPORT", "Bulk upload"], ["UPDATE", "Edited"], ["REVISION", "Revision"], ["STATUS", "Status change"], ["UPLOAD", "File upload"],
];

/** Validation history across records, limited to the sides this person may see. */
export async function activityQuery(a: AffiliateAccess, q: Query, take: number) {
  const sides = (["SALES", "DELIVERY"] as const).filter((s) => canViewSide(a, s));
  const side = sides.find((s) => s === param(q, "side"));
  const action = ACTIVITY_ACTIONS.some(([k]) => k === param(q, "action")) ? param(q, "action") : "";
  const actor = /^\d+$/.test(param(q, "actor")) ? Number(param(q, "actor")) : undefined;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(param(q, "from")) ? param(q, "from") : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(param(q, "to")) ? param(q, "to") : "";
  const search = param(q, "q");
  // Narrow by record only when needed (one side, or a record search).
  const narrow = side || sides.length < 2 || search;
  // ponytail: record ids go into an IN list; fine for tens of thousands of records, use a join (raw SQL) beyond that.
  const ids = narrow
    ? (await db.validation.findMany({
        where: { side: { in: side ? [side] : sides }, ...(search && { OR: [{ number: { contains: search, mode: "insensitive" } }, { importId: { contains: search, mode: "insensitive" } }] }) },
        select: { id: true },
      })).map((v) => String(v.id))
    : undefined;
  const entries = await db.auditLog.findMany({
    where: {
      entityType: "VALIDATION",
      ...(ids && { entityId: { in: ids } }),
      ...(action && { action }),
      ...(actor && { actorId: actor }),
      ...((from || to) && { createdAt: { ...(from && { gte: new Date(`${from}T00:00:00+05:30`) }), ...(to && { lt: new Date(new Date(`${to}T00:00:00+05:30`).getTime() + 86_400_000) }) } }),
    },
    include: { actor: true },
    orderBy: { createdAt: "desc" },
    take,
  });
  const records = await db.validation.findMany({
    where: { id: { in: [...new Set(entries.map((e) => Number(e.entityId)))] } },
    select: { id: true, side: true, number: true, campaign: { select: { name: true, advertiser: { select: { name: true } } } }, publisher: { select: { name: true } } },
  });
  const byId = new Map(records.map((r) => [String(r.id), r]));
  return { sides, side: side ?? "", action, actor, from, to, search, entries: entries.map((e) => ({ ...e, record: byId.get(e.entityId ?? "") })) };
}

import type { User } from "@prisma/client";
import { notFound, redirect } from "next/navigation";
import { SIDES, type Actor, type Side } from "./affiliate-rules";
import { requireUser } from "./auth";
import { db } from "./db";
import { FINANCE_TEAM } from "./finance";

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

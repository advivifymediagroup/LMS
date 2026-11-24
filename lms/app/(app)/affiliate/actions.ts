"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { actorFor, affiliateAccess, canManageDirectory, canViewSide, nextValidationNumber, type AffiliateAccess } from "@/lib/affiliate";
import { allowedMoves, canEditRecord, CURRENCIES, fileType, MAX_FILE_BYTES, NEEDS_NOTE, needsRevision, REVISABLE, REVISION_TO, SIDES, STATUS_LABEL, type Side, type Status } from "@/lib/affiliate-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, todayIso } from "@/lib/leave";
import type { FormState } from "../admin/actions";

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const blank = (v: unknown) => (v === "" || v == null ? undefined : v);
const optText = (max: number) => z.preprocess(blank, z.string().trim().max(max).optional());
const int = (label: string) => z.coerce.number({ error: `${label} must be a number.` }).int(`${label} must be a whole number.`).min(0, `${label} can't be negative.`).max(1e9);
const money = (label: string) => z.coerce.number({ error: `${label} must be a number.` }).min(0, `${label} can't be negative.`).max(1e11);

const Input = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick the validation month."),
  campaignId: z.coerce.number({ error: "Pick a campaign." }).int().positive("Pick a campaign."),
  publisherId: z.preprocess(blank, z.coerce.number().int().positive().optional()),
  clientRef: optText(100),
  geo: optText(60),
  platform: z.preprocess(blank, z.enum(["ANDROID", "IOS", "WEB"]).optional()),
  offerModel: z.preprocess(blank, z.enum(["CPI", "CPA", "CPS", "CPL", "CPR"]).optional()),
  totalConversions: int("Total conversions"),
  approvedConversions: int("Approved conversions"),
  rejectedConversions: z.preprocess(blank, int("Rejected conversions").optional()),
  payoutRate: z.preprocess(blank, money("Payout rate").optional()),
  amount: z.preprocess(blank, money("Amount").optional()),
  deduction: z.preprocess(blank, money("Deduction").optional()),
  currency: z.enum(CURRENCIES, "Pick a currency."),
  invoiceNumber: optText(60),
  invoiceDate: z.preprocess(blank, z.iso.date().optional()),
  remarks: optText(2000),
});

async function access() {
  return affiliateAccess(await requireUser());
}

/** Reads the optional "file" input. Returns the file data, nothing, or an error message. */
async function readFile(form: FormData): Promise<{ fileName: string; contentType: string; size: number; data: Uint8Array<ArrayBuffer> } | null | string> {
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > MAX_FILE_BYTES) return "The file is larger than 10 MB.";
  const data = new Uint8Array(await file.arrayBuffer());
  const contentType = fileType(file.name, data.subarray(0, 8192));
  if (!contentType) return "Upload an Excel (.xlsx/.xls), CSV or PDF file.";
  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "report";
  return { fileName, contentType, size: data.length, data };
}

export async function saveValidation(side: Side, id: number | null, _: FormState, form: FormData): Promise<FormState> {
  const a = await access();
  const actor = actorFor(a, side);
  const before = id ? await db.validation.findUnique({ where: { id } }) : null;
  if (id && (!before || before.side !== side)) return { error: "That validation no longer exists." };
  if (before ? !canEditRecord(side, before.status, actor) : !(actor.team || actor.admin))
    return { error: before ? `This validation is ${STATUS_LABEL[before.status].toLowerCase()} and can't be edited.` : `Only the ${SIDES[side].team} team can add these.` };

  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;
  const today = await todayIso();
  if (p.month > today.slice(0, 7)) return { error: "The validation month can't be in the future." };

  const campaign = await db.campaign.findUnique({ where: { id: p.campaignId } });
  if (!campaign) return { error: "Pick a campaign." };
  const delivery = side === "DELIVERY";
  if (delivery && !(p.publisherId && (await db.publisher.findUnique({ where: { id: p.publisherId } })))) return { error: "Pick a publisher." };

  const geo = p.geo ?? campaign.geo;
  const offerModel = p.offerModel ?? campaign.offerModel;
  if (!geo) return { error: "Enter the GEO (the campaign has none set)." };
  if (!offerModel) return { error: "Pick the offer model (the campaign has none set)." };
  if (p.approvedConversions > p.totalConversions) return { error: "Approved conversions can't be more than the total." };
  const rejected = p.rejectedConversions ?? p.totalConversions - p.approvedConversions;
  if (p.approvedConversions + rejected > p.totalConversions) return { error: "Approved plus rejected conversions can't be more than the total." };

  // Delivery with a payout rate: gross is always approved conversions × rate. Without one, it's entered.
  const amount = delivery && p.payoutRate != null ? Math.round(p.approvedConversions * p.payoutRate * 100) / 100 : p.amount;
  if (amount == null) return { error: delivery ? "Enter the gross amount or a payout rate." : "Enter the approved amount." };
  const deduction = p.deduction ?? 0;
  if (deduction > amount) return { error: "The deduction can't be more than the amount." };

  const file = await readFile(form);
  if (typeof file === "string") return { error: file };

  // Past approval, a change is a revision: it needs a reason and (unless payment is under way) goes back for review.
  const revising = !!before && needsRevision(side, before.status);
  const reason = String(form.get("reason") ?? "").trim().slice(0, 2000);
  if (revising && !reason) return { error: "Give a reason for the revision." };
  const reopen = revising && REVISABLE[side].includes(before!.status);
  const revision = revising
    ? { revision: before!.revision + 1, ...(reopen && { status: REVISION_TO[side], approvedAmount: null }) }
    : {};

  const data = {
    month: p.month, campaignId: campaign.id, geo: geo.toUpperCase(), platform: p.platform ?? campaign.platform, offerModel,
    totalConversions: p.totalConversions, approvedConversions: p.approvedConversions, rejectedConversions: rejected,
    amount, deduction, netAmount: Math.round((amount - deduction) * 100) / 100, currency: p.currency, remarks: p.remarks ?? null,
    ...(delivery
      ? { publisherId: p.publisherId!, payoutRate: p.payoutRate ?? null, invoiceNumber: p.invoiceNumber ?? null, invoiceDate: p.invoiceDate ? fromIso(p.invoiceDate) : null }
      : { clientRef: p.clientRef ?? null }),
  };

  let savedId = id;
  if (id) {
    const saved = await db.$transaction(async (tx) => {
      // Guard on status so an edit can't race a Finance move (the edit rules depend on the status).
      const { count } = await tx.validation.updateMany({ where: { id, status: before!.status }, data: { ...data, ...revision } });
      if (!count) return false;
      if (file) await tx.validationFile.create({ data: { ...file, validationId: id, uploadedById: a.user.id } });
      const metadata = { ...(file && { file: file.fileName }), ...(revising && { note: reason }) };
      await writeAudit(tx, {
        actorId: a.user.id, action: revising ? "REVISION" : "UPDATE", entityType: "VALIDATION", entityId: id,
        before, after: { ...data, ...revision }, metadata: Object.keys(metadata).length ? metadata : undefined,
      });
      return true;
    });
    if (!saved) return { error: "Someone changed this record's status while you were editing. Refresh and try again." };
  } else {
    // Numbers come from the latest one; retry if two people save at the same moment.
    for (let attempt = 0; ; attempt++) {
      try {
        const number = await nextValidationNumber(side, today);
        savedId = await db.$transaction(async (tx) => {
          const v = await tx.validation.create({ data: { ...data, side, number, createdById: a.user.id } });
          if (file) await tx.validationFile.create({ data: { ...file, validationId: v.id, uploadedById: a.user.id } });
          await writeAudit(tx, { actorId: a.user.id, action: "CREATE", entityType: "VALIDATION", entityId: v.id, after: { number, ...data }, metadata: file ? { file: file.fileName } : undefined });
          return v.id;
        });
        break;
      } catch (e) {
        if (!isUnique(e) || attempt >= 3) throw e;
      }
    }
  }
  revalidatePath(`/affiliate/${SIDES[side].slug}`);
  if (!id) redirect(`/affiliate/${SIDES[side].slug}/${savedId}`);
  revalidatePath(`/affiliate/${SIDES[side].slug}/${id}`);
  return { ok: revising ? (reopen ? `Revision ${before!.revision + 1} saved and sent back for review.` : `Revision ${before!.revision + 1} saved.`) : "Saved." };
}

export async function moveValidation(id: number, _: FormState, form: FormData): Promise<FormState> {
  const a = await access();
  const v = await db.validation.findUnique({ where: { id } });
  if (!v || !canViewSide(a, v.side)) return { error: "That validation no longer exists." };
  const to = String(form.get("to") ?? "") as Status;
  const move = allowedMoves(v.side, v.status, actorFor(a, v.side)).find((mv) => mv.to === to);
  if (!move) return { error: "That status change isn't available. Refresh the page." };
  const note = String(form.get("note") ?? "").trim().slice(0, 2000) || null;
  if (NEEDS_NOTE.includes(to) && !note) return { error: `Add a note explaining why it's ${STATUS_LABEL[to].toLowerCase()}.` };

  const today = await todayIso();
  // Extra details some moves record.
  const extra: { approvedAmount?: number | null; invoiceNumber?: string; invoiceDate?: Date | null; paidDate?: Date; paymentRef?: string | null } = {};
  if (to === "PARTIALLY_APPROVED") {
    const n = Number(form.get("approvedAmount"));
    if (!form.get("approvedAmount") || !(n > 0) || n >= Number(v.netAmount))
      return { error: `Enter the approved part: more than 0 and less than the net ${v.netAmount.toString()} ${v.currency}.` };
    extra.approvedAmount = Math.round(n * 100) / 100;
  }
  if (to === "APPROVED" && v.side === "SALES") extra.approvedAmount = null; // full approval counts the whole net amount
  if (to === "INVOICE_RECEIVED") {
    const invoiceNumber = String(form.get("invoiceNumber") ?? "").trim().slice(0, 60) || v.invoiceNumber;
    if (!invoiceNumber) return { error: "Enter the publisher's invoice number." };
    const d = String(form.get("invoiceDate") ?? "");
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today)) return { error: "The invoice date can't be in the future." };
    Object.assign(extra, { invoiceNumber, ...(d && { invoiceDate: fromIso(d) }) });
  }
  if (to === "PAID") {
    const d = String(form.get("paidDate") ?? "") || today;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today) return { error: "The payment date can't be in the future." };
    Object.assign(extra, { paidDate: fromIso(d), paymentRef: String(form.get("paymentRef") ?? "").trim().slice(0, 100) || null });
  }

  const data = {
    status: to,
    ...extra,
    ...(to === "SUBMITTED" && { submittedAt: new Date() }),
    ...(to === "SENT_TO_PUBLISHER" && { sentDate: fromIso(today) }),
  };
  const moved = await db.$transaction(async (tx) => {
    // Only move if nobody else moved it first.
    const { count } = await tx.validation.updateMany({ where: { id, status: v.status }, data });
    if (!count) return false;
    await writeAudit(tx, { actorId: a.user.id, action: "STATUS", entityType: "VALIDATION", entityId: id, before: { status: v.status }, after: { status: to, ...extra }, metadata: note ? { note } : undefined });
    return true;
  });
  if (!moved) return { error: "Someone else changed this record first. Refresh the page." };
  revalidatePath(`/affiliate/${SIDES[v.side].slug}`);
  revalidatePath(`/affiliate/${SIDES[v.side].slug}/${id}`);
  return { ok: `Moved to ${STATUS_LABEL[to]}.` };
}

export async function addFile(id: number, _: FormState, form: FormData): Promise<FormState> {
  const a = await access();
  const v = await db.validation.findUnique({ where: { id } });
  if (!v || !canViewSide(a, v.side)) return { error: "That validation no longer exists." };
  const actor = actorFor(a, v.side);
  if (!(actor.admin || actor.team || actor.finance)) return { error: "You can view this validation but not add files." };
  const file = await readFile(form);
  if (!file) return { error: "Choose a file." };
  if (typeof file === "string") return { error: file };
  await db.$transaction(async (tx) => {
    await tx.validationFile.create({ data: { ...file, validationId: id, uploadedById: a.user.id } });
    await writeAudit(tx, { actorId: a.user.id, action: "UPLOAD", entityType: "VALIDATION", entityId: id, metadata: { file: file.fileName } });
  });
  revalidatePath(`/affiliate/${SIDES[v.side].slug}/${id}`);
  return { ok: `Uploaded ${file.fileName}.` };
}

// ---------- Directory: advertisers, campaigns, publishers ----------

async function directoryAccess(): Promise<AffiliateAccess | null> {
  const a = await access();
  return canManageDirectory(a) ? a : null;
}

const name = (label: string) => z.string().trim().min(1, `${label} is required.`).max(150);

export async function addAdvertiser(_: FormState, form: FormData): Promise<FormState> {
  const a = await directoryAccess();
  if (!a) return { error: "You can't change the directory." };
  const p = z.object({ name: name("Advertiser name") }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  try {
    const row = await db.advertiser.create({ data: p.data });
    await writeAudit(db, { actorId: a.user.id, action: "CREATE", entityType: "ADVERTISER", entityId: row.id, after: p.data });
  } catch (e) {
    if (isUnique(e)) return { error: "That advertiser already exists." };
    throw e;
  }
  revalidatePath("/affiliate/directory");
  return { ok: `Added ${p.data.name}.` };
}

export async function addCampaign(_: FormState, form: FormData): Promise<FormState> {
  const a = await directoryAccess();
  if (!a) return { error: "You can't change the directory." };
  const p = z.object({
    advertiserId: z.coerce.number({ error: "Pick the advertiser." }).int().positive("Pick the advertiser."),
    name: name("Campaign name"),
    geo: optText(60),
    platform: z.preprocess(blank, z.enum(["ANDROID", "IOS", "WEB"]).optional()),
    offerModel: z.preprocess(blank, z.enum(["CPI", "CPA", "CPS", "CPL", "CPR"]).optional()),
  }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const data = { ...p.data, geo: p.data.geo?.toUpperCase() };
  try {
    const row = await db.campaign.create({ data });
    await writeAudit(db, { actorId: a.user.id, action: "CREATE", entityType: "CAMPAIGN", entityId: row.id, after: data });
  } catch (e) {
    if (isUnique(e)) return { error: "That advertiser already has a campaign with this name." };
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") return { error: "Pick the advertiser." };
    throw e;
  }
  revalidatePath("/affiliate/directory");
  return { ok: `Added ${data.name}.` };
}

export async function addPublisher(_: FormState, form: FormData): Promise<FormState> {
  const a = await directoryAccess();
  if (!a) return { error: "You can't change the directory." };
  const p = z.object({ name: name("Publisher name"), code: optText(40) }).safeParse(Object.fromEntries(form));
  if (!p.success) return { error: p.error.issues[0].message };
  const data = { name: p.data.name, code: p.data.code?.toUpperCase() ?? null };
  try {
    const row = await db.publisher.create({ data });
    await writeAudit(db, { actorId: a.user.id, action: "CREATE", entityType: "PUBLISHER", entityId: row.id, after: data });
  } catch (e) {
    if (isUnique(e)) return { error: "A publisher with that name or ID already exists." };
    throw e;
  }
  revalidatePath("/affiliate/directory");
  return { ok: `Added ${data.name}.` };
}

/** Hide (or bring back) an entry in the pick lists. Existing validations keep it. */
export async function toggleActive(kind: "advertiser" | "campaign" | "publisher", id: number) {
  const a = await directoryAccess();
  if (!a) return;
  const where = { id };
  const row = kind === "advertiser" ? await db.advertiser.findUnique({ where })
    : kind === "campaign" ? await db.campaign.findUnique({ where }) : await db.publisher.findUnique({ where });
  if (!row) return;
  const data = { active: !row.active };
  if (kind === "advertiser") await db.advertiser.update({ where, data });
  else if (kind === "campaign") await db.campaign.update({ where, data });
  else await db.publisher.update({ where, data });
  await writeAudit(db, { actorId: a.user.id, action: row.active ? "DEACTIVATE" : "ACTIVATE", entityType: kind.toUpperCase(), entityId: id });
  revalidatePath("/affiliate/directory");
}

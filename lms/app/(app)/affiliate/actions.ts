"use server";

import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { actorFor, affiliateAccess, canManageDirectory, canViewSide, nextValidationNumber, type AffiliateAccess } from "@/lib/affiliate";
import { allowedMoves, canEditRecord, CURRENCIES, fileType, MAX_FILE_BYTES, readSheet, NEEDS_NOTE, needsRevision, REVISABLE, REVISION_TO, SIDES, STATUS_LABEL, type Side, type Status } from "@/lib/affiliate-rules";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { fromIso, todayIso } from "@/lib/leave";
import { notifyImport, notifyStatus } from "@/lib/notifications";
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

type Parsed = z.infer<typeof Input>;
type Built = { data: ReturnType<typeof record> } | { error: string };
const record = (side: Side, p: Parsed, campaign: { id: number; platform: Parsed["platform"] | null }, geo: string, offerModel: NonNullable<Parsed["offerModel"]>, rejected: number, amount: number, deduction: number) => ({
  month: p.month, campaignId: campaign.id, geo: geo.toUpperCase(), platform: p.platform ?? campaign.platform, offerModel,
  totalConversions: p.totalConversions, approvedConversions: p.approvedConversions, rejectedConversions: rejected,
  amount, deduction, netAmount: Math.round((amount - deduction) * 100) / 100, currency: p.currency, remarks: p.remarks ?? null,
  ...(side === "DELIVERY"
    ? { publisherId: p.publisherId!, payoutRate: p.payoutRate ?? null, invoiceNumber: p.invoiceNumber ?? null, invoiceDate: p.invoiceDate ? fromIso(p.invoiceDate) : null }
    : { clientRef: p.clientRef ?? null }),
});

/** Checks the figures and works out rejected, gross and net. Shared by manual entry and bulk upload. */
function build(side: Side, p: Parsed, today: string, campaign: { id: number; geo: string | null; offerModel: Parsed["offerModel"] | null; platform: Parsed["platform"] | null } | null, publisherOk: boolean): Built {
  if (p.month > today.slice(0, 7)) return { error: "The validation month can't be in the future." };
  if (!campaign) return { error: "Pick a campaign." };
  const delivery = side === "DELIVERY";
  if (delivery && !publisherOk) return { error: "Pick a publisher." };
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
  if (p.invoiceDate && p.invoiceDate > today) return { error: "The invoice date can't be in the future." };
  return { data: record(side, p, campaign, geo, offerModel, rejected, amount, deduction) };
}

const by = (a: AffiliateAccess) => ({ id: a.user.id, name: a.user.name, finance: a.finance });

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
  const campaign = await db.campaign.findUnique({ where: { id: p.campaignId } });
  const publisherOk = !!p.publisherId && !!(await db.publisher.findUnique({ where: { id: p.publisherId } }));
  const built = build(side, p, today, campaign, publisherOk);
  if ("error" in built) return built;
  const { data } = built;

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
    if (reopen) await notifyStatus(id, by(a), reason);
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
  await notifyStatus(id, by(a), note);
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

// ---------- Bulk upload ----------

export type ImportRow = { line: number; what: string; month: string; geo: string; approved: string; net: string; error?: string };
export type ImportState = { error?: string; ok?: string; csv?: string; rows?: ImportRow[]; done?: { count: number; importId: string } } | null;

const fmt = (n: number, c: string) => `${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${c}`;

/**
 * Bulk upload in two steps, both through this action: "check" parses the file (or the corrected
 * text) and returns a preview with every problem; "import" re-checks and saves only if nothing is wrong.
 */
export async function importValidations(side: Side, _: ImportState, form: FormData): Promise<ImportState> {
  const a = await access();
  if (!(actorFor(a, side).team || a.admin)) return { error: `Only the ${SIDES[side].team} team can upload these.` };
  const file = form.get("file");
  let csv = String(form.get("csv") ?? "");
  if (file instanceof File && file.size > 0) {
    if (file.size > 2 * 1024 * 1024) return { error: "The file is larger than 2 MB. Split it into smaller files." };
    if (!/\.(csv|txt)$/i.test(file.name)) return { error: "Upload the template saved as CSV (File → Save As → CSV UTF-8). Excel .xlsx files can't be read yet." };
    csv = await file.text();
  }
  if (!csv.trim()) return { error: "Choose the filled-in template." };
  const sheet = readSheet(side, parseCsv(csv));
  if ("error" in sheet) return { error: sheet.error, csv };

  const [advertisers, campaigns, publishers, today] = await Promise.all([
    db.advertiser.findMany(), db.campaign.findMany(), db.publisher.findMany(), todayIso(),
  ]);
  const low = (x: string) => x.trim().toLowerCase();
  const advByName = new Map(advertisers.map((x) => [low(x.name), x]));
  const pubByName = new Map(publishers.flatMap((x) => [[low(x.name), x], ...(x.code ? [[low(x.code), x] as const] : [])]));

  const rows: (ImportRow & { data?: Extract<Built, { data: unknown }>["data"] })[] = [];
  for (const { line, values: v } of sheet.lines) {
    const adv = advByName.get(low(v.client));
    const camp = adv && campaigns.find((c) => c.advertiserId === adv.id && low(c.name) === low(v.campaign));
    const pub = side === "DELIVERY" ? pubByName.get(low(v.publisher)) : undefined;
    const what = [v.client, v.campaign, side === "DELIVERY" ? v.publisher : ""].filter(Boolean).join(" · ");
    const row: (typeof rows)[number] = { line, what, month: v.month, geo: v.geo, approved: v.approvedConversions, net: "" };
    rows.push(row);
    if (!adv) { row.error = v.client ? `Client "${v.client}" isn't in Clients & publishers.` : "Client is missing."; continue; }
    if (!camp) { row.error = v.campaign ? `${adv.name} has no campaign called "${v.campaign}".` : "Campaign is missing."; continue; }
    if (side === "DELIVERY" && !pub) { row.error = v.publisher ? `Publisher "${v.publisher}" isn't in Clients & publishers.` : "Publisher is missing."; continue; }
    if (v.platform && !["ANDROID", "IOS", "WEB"].includes(v.platform)) { row.error = "Platform must be Android, iOS, Web or blank."; continue; }
    if (v.offerModel && !["CPI", "CPA", "CPS", "CPL", "CPR"].includes(v.offerModel)) { row.error = "Offer model must be CPI, CPA, CPS, CPL or CPR."; continue; }
    if (v.currency && !(CURRENCIES as readonly string[]).includes(v.currency)) { row.error = `Currency must be one of ${CURRENCIES.join(", ")}.`; continue; }
    const parsed = Input.safeParse({ ...v, campaignId: camp.id, publisherId: pub?.id });
    if (!parsed.success) { row.error = parsed.error.issues[0].message.replace("Pick the validation month.", "Month must look like 2026-11."); continue; }
    const built = build(side, parsed.data, today, camp, !!pub);
    if ("error" in built) { row.error = built.error; continue; }
    row.data = built.data;
    row.geo = built.data.geo;
    row.net = fmt(built.data.netAmount, built.data.currency);
  }

  // Duplicates: same campaign, month, GEO, currency (and publisher), within the file or already saved.
  const dupKey = (d: { campaignId: number; month: string; geo: string; currency: string; publisherId?: number | null }) =>
    `${d.campaignId}|${d.month}|${d.geo}|${d.currency}|${d.publisherId ?? ""}`;
  const ok = rows.filter((r) => r.data);
  const existing = ok.length
    ? await db.validation.findMany({
        where: { side, campaignId: { in: [...new Set(ok.map((r) => r.data!.campaignId))] }, month: { in: [...new Set(ok.map((r) => r.data!.month))] } },
        select: { number: true, campaignId: true, month: true, geo: true, currency: true, publisherId: true },
      })
    : [];
  const saved = new Map(existing.map((e) => [dupKey(e), e.number]));
  const seen = new Map<string, number>();
  for (const r of ok) {
    const k = dupKey(r.data!);
    if (seen.has(k)) r.error = `Duplicate of line ${seen.get(k)} (same campaign, month, GEO, currency${side === "DELIVERY" ? " and publisher" : ""}).`;
    else if (saved.has(k)) r.error = `Already saved as ${saved.get(k)}. Edit that record instead.`;
    seen.set(k, seen.get(k) ?? r.line);
  }

  const preview: ImportRow[] = rows.map(({ line, what, month, geo, approved, net, error }) => ({ line, what, month, geo, approved, net, error }));
  const bad = rows.filter((r) => r.error).length;
  if (form.get("intent") !== "import" || bad)
    return { csv, rows: preview, ...(form.get("intent") === "import" && bad && { error: `Nothing imported: fix the ${bad} row${bad === 1 ? "" : "s"} marked below.` }) };

  // Save everything in one go, numbered in sequence, each tagged with the upload ID.
  const submit = form.get("submit") === "on";
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const importId = `IMP-${stamp}-${a.user.employeeId}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const first = await nextValidationNumber(side, today);
      const prefix = first.slice(0, -4);
      const start = Number(first.slice(-4));
      await db.$transaction(async (tx) => {
        for (const [i, r] of rows.entries()) {
          const number = prefix + String(start + i).padStart(4, "0");
          const v = await tx.validation.create({
            data: { ...r.data!, side, number, importId, createdById: a.user.id, ...(submit && { status: "SUBMITTED", submittedAt: new Date() }) },
          });
          await writeAudit(tx, { actorId: a.user.id, action: "IMPORT", entityType: "VALIDATION", entityId: v.id, after: { number, status: v.status, ...r.data }, metadata: { importId, line: r.line } });
        }
      }, { timeout: 120_000 });
      break;
    } catch (e) {
      if (!isUnique(e) || attempt >= 3) throw e;
    }
  }
  await notifyImport(side, rows.length, importId, by(a), submit);
  revalidatePath(`/affiliate/${SIDES[side].slug}`);
  return { done: { count: rows.length, importId }, ok: `Imported ${rows.length} record${rows.length === 1 ? "" : "s"}${submit ? " and submitted them for review" : " as drafts"}.` };
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

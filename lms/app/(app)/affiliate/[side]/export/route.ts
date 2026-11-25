import { notFound } from "next/navigation";
import { listFilter, requireAffiliate } from "@/lib/affiliate";
import { PAYMENT_LABEL, payment, SIDES, STATUS_LABEL, sideFromSlug } from "@/lib/affiliate-rules";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";
import { toIso } from "@/lib/leave-days";

/** Every field of the filtered validations, for Excel. */
export async function GET(req: Request, { params }: RouteContext<"/affiliate/[side]/export">) {
  const side = sideFromSlug((await params).side);
  if (!side) notFound();
  await requireAffiliate(side);
  const { month, where } = listFilter(side, Object.fromEntries(new URL(req.url).searchParams));
  const rows = await db.validation.findMany({
    where, include: { campaign: { include: { advertiser: true } }, publisher: true, createdBy: true }, orderBy: [{ month: "desc" }, { number: "asc" }],
  });
  const d = side === "DELIVERY";
  const day = (x: Date | null) => (x ? toIso(x) : "");
  const n = (x: { toString(): string } | null) => (x == null ? "" : Number(x));
  const csv = toCsv([
    ["ID", "Month", "Client", "Campaign", ...(d ? ["Publisher", "Publisher ID"] : ["Client campaign ID"]), "GEO", "Platform", "Offer model",
      d ? "Delivered conversions" : "Total conversions", "Approved conversions", "Rejected conversions", ...(d ? ["Payout rate", "Gross amount"] : ["Approved amount"]),
      "Deduction", "Net amount", ...(d ? [] : ["Finance approved (partial)"]), "Currency", "Status",
      ...(d ? ["Payment", "Invoice number", "Invoice date", "Sent to publisher", "Paid on", "Payment ref."] : []),
      "Revision", "Upload ID", "Uploaded by", "Created", "Remarks"],
    ...rows.map((r) => [
      r.number, r.month, r.campaign.advertiser.name, r.campaign.name, ...(d ? [r.publisher?.name ?? "", r.publisher?.code ?? ""] : [r.clientRef ?? ""]),
      r.geo, r.platform ?? "", r.offerModel, r.totalConversions, r.approvedConversions, r.rejectedConversions,
      ...(d ? [n(r.payoutRate), n(r.amount)] : [n(r.amount)]), n(r.deduction), n(r.netAmount), ...(d ? [] : [n(r.approvedAmount)]), r.currency, STATUS_LABEL[r.status],
      ...(d ? [PAYMENT_LABEL[payment(r.status)], r.invoiceNumber ?? "", day(r.invoiceDate), day(r.sentDate), day(r.paidDate), r.paymentRef ?? ""] : []),
      r.revision, r.importId ?? "", r.createdBy.name, r.createdAt.toISOString().slice(0, 10), r.remarks ?? "",
    ]),
  ]);
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${SIDES[side].slug}-validations${month ? `-${month}` : ""}.csv"` },
  });
}

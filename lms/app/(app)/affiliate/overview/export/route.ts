import { redirect } from "next/navigation";
import { overviewFilter, requireAffiliate } from "@/lib/affiliate";
import { reconcile } from "@/lib/affiliate-rules";
import { toCsv } from "@/lib/csv";
import { db } from "@/lib/db";

/** The campaign reconciliation for the chosen period and filters: the monthly report for Excel. */
export async function GET(req: Request) {
  const a = await requireAffiliate();
  if (!(a.admin || a.finance || a.leadership)) redirect("/dashboard");
  const { where, period } = await overviewFilter(Object.fromEntries(new URL(req.url).searchParams));
  const [rows, campaigns, publishers] = await Promise.all([
    db.validation.findMany({ where, take: 50000 }),
    db.campaign.findMany({ include: { advertiser: true } }),
    db.publisher.findMany(),
  ]);
  const camp = new Map(campaigns.map((c) => [c.id, c]));
  const pub = new Map(publishers.map((p) => [p.id, p.name]));
  const rec = reconcile(rows.map((r) => ({ ...r, netAmount: Number(r.netAmount), approvedAmount: r.approvedAmount == null ? null : Number(r.approvedAmount) })))
    .sort((x, y) => x.month.localeCompare(y.month) || (camp.get(x.campaignId)?.advertiser.name ?? "").localeCompare(camp.get(y.campaignId)?.advertiser.name ?? ""));
  const csv = toCsv([
    ["Month", "Client", "Campaign", "GEO", "Currency", "Client approved conv.", "Publisher approved conv.", "Validated revenue", "Publisher cost",
      "Gross margin", "Margin %", "Revenue pending", "Cost pending", "Revenue disputed", "Cost disputed", "Publishers (approved / in progress)"],
    ...rec.map((g) => {
      const c = camp.get(g.campaignId);
      return [
        g.month, c?.advertiser.name ?? "", c?.name ?? "", g.geo, g.currency, g.clientConv, g.publisherConv, g.revenue.approved, g.cost.approved,
        g.margin, g.marginPct ?? "", g.revenue.pending + g.revenue.draft, g.cost.pending + g.cost.draft, g.revenue.disputed, g.cost.disputed,
        [...g.publishers].map(([id, p]) => `${pub.get(id)}: ${p.approved} / ${p.open}`).join("; "),
      ];
    }),
  ]);
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="affiliate-reconciliation-${period.replace(/\W+/g, "-").toLowerCase()}.csv"` },
  });
}

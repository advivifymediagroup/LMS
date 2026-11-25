import { activityQuery, requireAffiliate } from "@/lib/affiliate";
import { describe, SIDES } from "@/lib/affiliate-rules";
import { toCsv } from "@/lib/csv";

export async function GET(req: Request) {
  const a = await requireAffiliate();
  const r = await activityQuery(a, Object.fromEntries(new URL(req.url).searchParams), 50000);
  const csv = toCsv([
    ["When (IST)", "Who", "Side", "Record", "Client", "Campaign", "Publisher", "What happened", "Changes", "Note", "File"],
    ...r.entries.map((e) => {
      const d = describe(e);
      const v = e.record;
      return [
        e.createdAt.toLocaleString("en-GB", { timeZone: "Asia/Kolkata" }), e.actor?.name ?? "System", v ? SIDES[v.side].label : "", v?.number ?? "",
        v?.campaign.advertiser.name ?? "", v?.campaign.name ?? "", v?.publisher?.name ?? "", d.title, d.changes.join("; "), d.note ?? "", d.file ?? "",
      ];
    }),
  ]);
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="affiliate-activity.csv"` },
  });
}

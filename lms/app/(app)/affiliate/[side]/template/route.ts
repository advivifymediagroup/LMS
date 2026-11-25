import { notFound } from "next/navigation";
import { requireAffiliate } from "@/lib/affiliate";
import { IMPORT_COLUMNS, SIDES, sideFromSlug } from "@/lib/affiliate-rules";
import { toCsv } from "@/lib/csv";

/** Blank upload template: the header row plus one example row to overwrite. Opens in Excel. */
export async function GET(_: Request, { params }: RouteContext<"/affiliate/[side]/template">) {
  const side = sideFromSlug((await params).side);
  if (!side) notFound();
  await requireAffiliate(side);
  const cols = IMPORT_COLUMNS[side];
  const csv = "﻿" + toCsv([cols.map((c) => c.header), cols.map((c) => c.example)]);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${SIDES[side].slug}-validations-template.csv"` },
  });
}

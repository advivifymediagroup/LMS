import { requireUser } from "@/lib/auth";
import { todayIso } from "@/lib/leave";
import { toCsv } from "@/lib/csv";
import { parseReportFilter, usageReport } from "@/lib/reports";

export async function GET(req: Request) {
  await requireUser(["ADMIN"]);
  const filter = parseReportFilter(Object.fromEntries(new URL(req.url).searchParams), (await todayIso()).slice(0, 4));
  const { types, rows } = await usageReport(filter);
  const csv = toCsv([
    ["Employee ID", "Name", "Department", ...types, "Total"],
    ...rows.map((r) => [r.employeeId, r.name, r.department, ...types.map((t) => r.byType[t] ?? 0), r.total]),
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leave-report_${filter.from}_${filter.to}.csv"`,
    },
  });
}

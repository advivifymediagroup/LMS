import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthName, reportData } from "@/lib/performance";
import { PROJECT_STATUSES, reportTemplate } from "@/lib/team-config";
import { ReportForm } from "../../report-form";
import { saveReport } from "../../actions";

export default async function EditReportPage({ params }: PageProps<"/reports/[id]/edit">) {
  const me = await requireUser();
  const id = Number((await params).id);
  const r = Number.isInteger(id) ? await db.performanceReport.findUnique({ where: { id } }) : null;
  if (!r || r.userId !== me.id) notFound();
  if (r.status !== "DRAFT") redirect(`/reports/${r.id}`);
  const t = reportTemplate(r.team ?? undefined);

  return (
    <div className="flex max-w-[860px] flex-col gap-4">
      <Link href={`/reports/${r.id}`} className="link text-sm">← Preview report</Link>
      <h1 className="h1">{monthName(r.month, true)} report <span className="text-base font-normal text-gray-500">{r.team ?? "No team"} template</span></h1>
      <ReportForm action={saveReport.bind(null, r.id)} designation={r.designation} data={reportData(r)} hints={t.hints} projectsTitle={t.projectsTitle} statuses={PROJECT_STATUSES} />
    </div>
  );
}

export const metadata = { title: "Edit report" };

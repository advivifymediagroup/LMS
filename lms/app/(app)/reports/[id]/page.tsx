import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { attendance, canReviewReport, canViewReport, monthName, reportData } from "@/lib/performance";
import { reportTemplate } from "@/lib/team-config";
import { ActionForm } from "../../action-form";
import { SubmitButton } from "../../../submit-button";
import { returnReport, saveReview } from "../actions";
import { PrintButton } from "../print-button";
import { ReportView } from "../report-view";

export default async function ReportPage({ params }: PageProps<"/reports/[id]">) {
  const me = await requireUser();
  const id = Number((await params).id);
  const r = Number.isInteger(id) ? await db.performanceReport.findUnique({ where: { id }, include: { user: { include: { department: true } }, reviewedBy: true } }) : null;
  if (!r || !canViewReport(me, r.user)) notFound();
  const mine = r.userId === me.id;
  const reviewer = canReviewReport(me, r.user);
  const team = r.team ?? r.user.department?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/reports" className="link text-sm">← Monthly reports</Link>
        <span className="flex-1" />
        <span className={`pill ${r.status === "SUBMITTED" ? "bg-char text-paper" : "bg-brand-50 text-brand-700"}`}>{r.status === "SUBMITTED" ? "Submitted" : "Draft"}</span>
        {mine && r.status === "DRAFT" && <Link href={`/reports/${r.id}/edit`} className="btn btn-sm">Edit</Link>}
        {reviewer && r.status === "SUBMITTED" && (
          <form action={returnReport.bind(null, r.id)}><SubmitButton className="btn btn-sm" pendingText="Returning…">Return for changes</SubmitButton></form>
        )}
        <PrintButton />
      </div>

      <ReportView r={{
        name: r.user.name, designation: r.designation, team, month: monthName(r.month), projectsTitle: reportTemplate(team).projectsTitle,
        attendance: await attendance(r.userId, r.month, await todayIso()),
        data: reportData(r), comment: r.reviewerComment, reviewer: r.reviewedBy?.name,
      }} />

      {reviewer && (
        <ActionForm action={saveReview.bind(null, r.id)} submit="Save comment" className="card mx-auto w-full max-w-[816px] space-y-3 print:hidden">
          <h2 className="card-title">Your comments</h2>
          <textarea className="input" name="comment" rows={4} maxLength={4000} defaultValue={r.reviewerComment ?? ""} placeholder="Contribution, progress and areas of improvement." />
        </ActionForm>
      )}
    </div>
  );
}

export const metadata = { title: "Monthly report" };

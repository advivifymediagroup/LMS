import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { addMonths } from "@/lib/leave-days";
import { monthName } from "@/lib/performance";
import { SubmitButton } from "../../submit-button";
import { startReport } from "./actions";

const Status = ({ s }: { s?: string }) =>
  !s ? <span className="text-[13px] text-gray-500">Not started</span>
    : <span className={`pill ${s === "SUBMITTED" ? "bg-char text-paper" : "bg-brand-50 text-brand-700"}`}>{s === "SUBMITTED" ? "Submitted" : "Draft"}</span>;

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const me = await requireUser();
  const q = await searchParams;
  const today = await todayIso();
  const lastMonth = addMonths(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? q.month : lastMonth;
  const reviewer = me.role !== "EMPLOYEE";

  const [mine, team] = await Promise.all([
    db.performanceReport.findMany({ where: { userId: me.id }, orderBy: { month: "desc" } }),
    reviewer
      ? db.user.findMany({
          where: { isActive: true, id: { not: me.id }, ...(me.role === "ADMIN" ? {} : { departmentId: me.departmentId ?? -1 }) },
          include: { department: true, performanceReports: { where: { month } } },
          orderBy: [{ department: { name: "asc" } }, { name: "asc" }],
        })
      : [],
  ]);

  return (
    <div className="flex max-w-[980px] flex-col gap-6">
      {typeof q.error === "string" && <p className="error">{q.error}</p>}
      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="card-title">Your monthly report</h2>
          <p className="text-sm text-gray-600">Pick a month to start or continue. Attendance comes from your leave records, and your tasks for the month are filled in to start from.</p>
        </div>
        <form action={startReport} className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="month">Month</label>
            <input className="input h-10" type="month" id="month" name="month" defaultValue={lastMonth} max={today.slice(0, 7)} required />
          </div>
          <SubmitButton className="btn btn-accent h-10" pendingText="Opening…">Open report</SubmitButton>
        </form>
        {mine.length > 0 && (
          <div className="overflow-hidden rounded-[10px] border border-gray-200">
            {mine.map((r, i) => (
              <Link key={r.id} href={`/reports/${r.id}`} className={`flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#fcfbf9] ${i ? "border-t border-[#f0ece6]" : ""}`}>
                <span className="text-sm font-bold">{monthName(r.month, true)}</span><Status s={r.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      {reviewer && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-extrabold">{me.role === "ADMIN" ? "Everyone's reports" : "Your team's reports"} · {monthName(month, true)}</h2>
              <p className="text-[13px] text-gray-600">{team.filter((u) => u.performanceReports[0]?.status === "SUBMITTED").length} of {team.length} submitted</p>
            </div>
            <form className="flex items-end gap-2">
              <input className="input h-9" type="month" name="month" defaultValue={month} aria-label="Month" />
              <button className="btn btn-sm h-9">Show</button>
            </form>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
            <table className="table min-w-[560px]">
              <thead><tr><th>Person</th><th>Team</th><th>Status</th><th /></tr></thead>
              <tbody>
                {team.map((u) => {
                  const r = u.performanceReports[0];
                  return (
                    <tr key={u.id}>
                      <td className="font-semibold">{u.name} <span className="font-mono text-xs font-normal text-gray-500">{u.employeeId}</span></td>
                      <td className="text-gray-700">{u.department?.name ?? "—"}</td>
                      <td><Status s={r?.status} /></td>
                      <td className="text-right">{r && <Link className="link text-[13px]" href={`/reports/${r.id}`}>Open</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export const metadata = { title: "Monthly reports" };

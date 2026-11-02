import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { parseReportFilter, usageReport } from "@/lib/reports";

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireUser(["ADMIN"]);
  const q = await searchParams;
  const filter = parseReportFilter(q, (await todayIso()).slice(0, 4));
  const [{ types, rows }, departments] = await Promise.all([usageReport(filter), db.department.findMany({ orderBy: { name: "asc" } })]);
  const totals = types.map((t) => rows.reduce((s, r) => s + (r.byType[t] ?? 0), 0));
  const qs = new URLSearchParams({ from: filter.from, to: filter.to, ...(filter.departmentId && { dept: String(filter.departmentId) }) });

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="h1 mb-0 mr-auto">Leave report</h1>
        <a className="btn" href={`/admin/reports/csv?${qs}`}>Download CSV</a>
      </div>
      <form className="card grid gap-3 sm:grid-cols-4 sm:items-end">
        <div>
          <label className="label" htmlFor="from">From</label>
          <input className="input" id="from" name="from" type="date" defaultValue={filter.from} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input className="input" id="to" name="to" type="date" defaultValue={filter.to} />
        </div>
        <div>
          <label className="label" htmlFor="dept">Department</label>
          <select className="input" id="dept" name="dept" defaultValue={filter.departmentId ?? ""}>
            <option value="">All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary">Show</button>
          <Link className="btn" href="/admin/reports">Reset</Link>
        </div>
      </form>
      <p className="text-sm text-gray-600">Approved leave days taken between {filter.from} and {filter.to}. Leave that crosses the range edge counts only the days inside it.</p>
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Employee</th><th>Department</th>
              {types.map((t) => <th key={t} className="text-right">{t}</th>)}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.employeeId}>
                <td>{r.name} <span className="text-gray-500">({r.employeeId})</span></td>
                <td>{r.department || "—"}</td>
                {types.map((t) => <td key={t} className="text-right">{r.byType[t] ?? 0}</td>)}
                <td className="text-right font-medium">{r.total}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td colSpan={2}>Total</td>
              {totals.map((n, i) => <td key={types[i]} className="text-right">{n}</td>)}
              <td className="text-right">{totals.reduce((a, b) => a + b, 0)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

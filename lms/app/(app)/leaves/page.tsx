import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso } from "@/lib/leave";
import { LeaveTable } from "./leave-table";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function LeaveHistoryPage({ searchParams }: PageProps<"/leaves">) {
  const user = await requireUser();
  const q = await searchParams;
  const scopes = [["mine", "My leaves"], ...(user.role !== "EMPLOYEE" ? [["team", "My team"]] : []), ...(user.role === "ADMIN" ? [["all", "Everyone"]] : [])];
  const scope = scopes.some(([s]) => s === q.scope) ? (q.scope as string) : "mine";
  const status = STATUSES.find((s) => s === q.status);
  const typeId = Number(q.type) || undefined;

  const where: Prisma.LeaveRequestWhereInput = {
    ...(scope === "mine" ? { userId: user.id } : scope === "team" ? { user: { managerId: user.id } } : {}),
    ...(status && { status }),
    ...(typeId && { leaveTypeId: typeId }),
    // Date filters match any leave that overlaps the range.
    ...(isDate(q.from) && { endDate: { gte: fromIso(q.from) } }),
    ...(isDate(q.to) && { startDate: { lte: fromIso(q.to) } }),
  };
  const [rows, types] = await Promise.all([
    db.leaveRequest.findMany({ where, include: { leaveType: true, user: true }, orderBy: { startDate: "desc" }, take: 500 }),
    db.leaveType.findMany({ orderBy: { id: "asc" } }),
  ]);
  const totalDays = rows.filter((r) => r.status === "APPROVED").reduce((s, r) => s + Number(r.days), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <h1 className="h1 mb-0 mr-auto">Leave history</h1>
        <Link className="btn btn-primary" href="/leaves/apply">Apply for leave</Link>
      </div>
      <form className="card grid gap-3 sm:grid-cols-6 sm:items-end">
        {scopes.length > 1 && (
          <div>
            <label className="label" htmlFor="scope">Whose</label>
            <select className="input" id="scope" name="scope" defaultValue={scope}>
              {scopes.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={status ?? ""}>
            <option value="">Any</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s.toLowerCase()}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="type">Type</label>
          <select className="input" id="type" name="type" defaultValue={typeId ?? ""}>
            <option value="">Any</option>
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="from">From</label>
          <input className="input" id="from" name="from" type="date" defaultValue={isDate(q.from) ? q.from : ""} />
        </div>
        <div>
          <label className="label" htmlFor="to">To</label>
          <input className="input" id="to" name="to" type="date" defaultValue={isDate(q.to) ? q.to : ""} />
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary hover:cursor-pointer">Filter</button>
          <Link className="btn" href="/leaves">Reset</Link>
        </div>
      </form>
      <p className="text-sm text-gray-600">{rows.length} request(s){rows.length === 500 && " (first 500)"} · {totalDays} approved day(s)</p>
      <LeaveTable rows={rows} showUser={scope !== "mine"} />
    </div>
  );
}

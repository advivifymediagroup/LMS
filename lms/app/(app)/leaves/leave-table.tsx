import Link from "next/link";
import type { LeaveRequest, LeaveType, User } from "@prisma/client";
import { toIso } from "@/lib/leave-days";

type Row = LeaveRequest & { leaveType: LeaveType; user?: User };

const STATUS_CLASS: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded px-2 py-0.5 text-xs capitalize font-medium ${STATUS_CLASS[status]}`}>{status.toLowerCase()}</span>;
}

export function dateRange(l: LeaveRequest) {
  const s = toIso(l.startDate), e = toIso(l.endDate);
  const halves = (h: string) => (h === "FIRST" ? " (1st half)" : h === "SECOND" ? " (2nd half)" : "");
  return s === e ? s + halves(l.startHalf) : `${s}${halves(l.startHalf)} → ${e}${halves(l.endHalf)}`;
}

export function LeaveTable({ rows, showUser = false }: { rows: Row[]; showUser?: boolean }) {
  if (!rows.length) return <p className="text-sm text-gray-500">No leave requests.</p>;
  return (
    <div className="card overflow-x-auto p-0">
      <table className="table">
        <thead>
          <tr>{showUser && <th>Employee</th>}<th>Type</th><th>Dates</th><th>Days</th><th>Status</th><th>Applied</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.id}>
              {showUser && <td>{l.user?.name}</td>}
              <td>{l.leaveType.code}</td>
              <td>{dateRange(l)}</td>
              <td>{Number(l.days)}</td>
              <td><StatusBadge status={l.status} /></td>
              <td>{toIso(l.createdAt)}</td>
              <td><Link className="text-blue-600" href={`/leaves/${l.id}`}>View</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

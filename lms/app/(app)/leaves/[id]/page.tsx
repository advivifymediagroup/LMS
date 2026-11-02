import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { cancelLeave } from "../actions";
import { StatusBadge, dateRange } from "../leave-table";

export default async function LeaveDetailPage({ params, searchParams }: PageProps<"/leaves/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  const { error } = await searchParams;
  const leave = Number.isInteger(id)
    ? await db.leaveRequest.findUnique({ where: { id }, include: { leaveType: true, user: true, approver: true } })
    : null;
  // Visible to the applicant, their manager, and admins.
  if (!leave || (leave.userId !== user.id && leave.user.managerId !== user.id && user.role !== "ADMIN")) notFound();

  const today = await todayIso();
  const mine = leave.userId === user.id;
  const canCancel = mine && (leave.status === "PENDING" || (leave.status === "APPROVED" && toIso(leave.startDate) > today));

  const rows: [string, React.ReactNode][] = [
    ["Employee", `${leave.user.name} (${leave.user.employeeId})`],
    ["Type", leave.leaveType.name],
    ["Dates", dateRange(leave)],
    ["Days charged", Number(leave.days)],
    ["Status", <StatusBadge key="s" status={leave.status} />],
    ["Reason", leave.reason],
    ["Notify", leave.ccEmails.join(", ") || "—"],
    ["Note", leave.note ?? "—"],
    ["Applied", toIso(leave.createdAt)],
    ["Decided by", leave.approver ? `${leave.approver.name} on ${toIso(leave.decidedAt!)}` : "—"],
    ["Decision note", leave.decisionReason ?? "—"],
  ];

  return (
    <div className="max-w-2xl space-y-4">
      <Link href={mine ? "/leaves" : "/approvals"} className="text-sm text-blue-600">← Back</Link>
      <h1 className="h1">Leave request #{leave.id}</h1>
      {typeof error === "string" && <p className="error">{error}</p>}
      <dl className="card grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-gray-500">{k}</dt><dd className="whitespace-pre-wrap">{v}</dd></div>
        ))}
      </dl>
      {canCancel && (
        <form action={cancelLeave.bind(null, leave.id)}>
          <button className="btn btn-danger">
            Cancel this leave{leave.status === "APPROVED" && leave.leaveType.needsBalance ? " (days go back to your balance)" : ""}
          </button>
        </form>
      )}
    </div>
  );
}

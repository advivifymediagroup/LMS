import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LeaveTable } from "./leave-table";

export default async function MyLeavesPage() {
  const user = await requireUser();
  const rows = await db.leaveRequest.findMany({
    where: { userId: user.id },
    include: { leaveType: true },
    orderBy: { startDate: "desc" },
  });
  return (
    <div>
      <div className="mb-4 flex items-center">
        <h1 className="h1 mb-0 mr-auto">My leaves</h1>
        <Link className="btn btn-primary" href="/leaves/apply">Apply for leave</Link>
      </div>
      <LeaveTable rows={rows} />
    </div>
  );
}

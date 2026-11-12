import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, todayIso } from "@/lib/leave";
import { addDays, toIso } from "@/lib/leave-days";
import { canMoveTask, dueGroup, dueLabel } from "@/lib/task-rules";
import { Avatar, PriorityPill, TASK_COLUMNS } from "../../ui";
import { StatusSelect } from "../status-select";

export default async function BoardPage({ searchParams }: PageProps<"/tasks/board">) {
  const me = await requireUser();
  const q = await searchParams;
  const today = await todayIso();
  const teams = await db.department.findMany({ orderBy: { name: "asc" } });
  // Default to the viewer's team; "all" shows every team.
  const teamId = q.team === "all" ? null : Number(q.team) || me.departmentId || null;
  const team = teams.find((t) => t.id === teamId) ?? null;
  const since = fromIso(addDays(today, -30)); // Done column shows the last 30 days

  const tasks = await db.task.findMany({
    where: { ...(team && { departmentId: team.id }), OR: [{ status: { not: "DONE" } }, { completedAt: { gte: since } }] },
    include: { assignee: true, department: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { id: "asc" }],
  });

  const chip = (on: boolean) => `flex h-[34px] items-center rounded-full border px-3.5 text-[13px] font-bold ${on ? "border-char bg-char text-white" : "border-gray-300 bg-white text-char hover:border-char"}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1.5">
          <Link href="/tasks/board?team=all" className={chip(!team)}>All teams</Link>
          {teams.map((t) => <Link key={t.id} href={`/tasks/board?team=${t.id}`} className={chip(team?.id === t.id)}>{t.name}</Link>)}
        </div>
        <Link href={`/tasks/new${team ? `?team=${team.id}` : ""}`} className="btn btn-accent h-[38px]">+ New task</Link>
      </div>

      <div className="grid grid-cols-[repeat(4,minmax(240px,1fr))] items-start gap-3.5 overflow-x-auto pb-2">
        {TASK_COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="flex min-h-[420px] flex-col gap-2.5 rounded-[14px] bg-gray-100 p-3">
              <div className="flex items-center gap-2 px-1 pt-1 pb-0.5">
                <span className={`size-2 rounded-[2px] ${col.dot}`} />
                <span className="flex-1 text-[13.5px] font-extrabold">{col.name}</span>
                <span className="font-mono text-xs font-medium text-gray-600">{items.length}</span>
              </div>
              {items.map((t) => {
                const due = t.dueDate && toIso(t.dueDate);
                const urgent = col.status !== "DONE" && ["Overdue", "Today"].includes(dueGroup(due, today));
                return (
                  <div key={t.id} className="flex flex-col gap-3 rounded-[10px] bg-white p-3.5 shadow-[0_1px_2px_rgba(31,33,36,.06)]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-medium text-gray-600">{t.department?.name ?? "No team"}</span>
                      <PriorityPill p={t.priority} />
                    </div>
                    <Link href={`/tasks/${t.id}`} className="text-sm leading-[1.35] font-bold text-pretty hover:text-brand-600">{t.title}</Link>
                    <div className="flex items-center justify-between gap-2">
                      {t.assignee ? <Avatar name={t.assignee.name} className="size-[26px] text-[10px]" /> : <span className="text-xs text-gray-500">Unassigned</span>}
                      <div className="flex items-center gap-2">
                        {canMoveTask(me, t) && <StatusSelect id={t.id} status={t.status} />}
                        <span className={`font-mono text-[11.5px] font-medium ${urgent ? "text-brand-700" : "text-gray-600"}`}>{dueLabel(due, today)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const metadata = { title: "Task board" };

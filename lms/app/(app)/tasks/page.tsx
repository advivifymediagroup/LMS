import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { DUE_GROUPS, dueGroup, dueLabel } from "@/lib/task-rules";
import { PriorityPill, TaskCheck } from "../ui";

const TABS = [["open", "Open"], ["done", "Done"], ["all", "All"]] as const;

export default async function MyTasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await requireUser();
  const q = await searchParams;
  const tab = TABS.find(([k]) => k === q.tab)?.[0] ?? "open";
  const today = await todayIso();
  const tasks = await db.task.findMany({
    where: { assigneeId: me.id },
    include: { department: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }, { id: "asc" }],
  });
  const done = tasks.filter((t) => t.status === "DONE");
  const open = tasks.filter((t) => t.status !== "DONE");
  const counts = { open: open.length, done: done.length, all: tasks.length };
  const visible = tab === "open" ? open : tab === "done" ? done : tasks;

  // Open tasks group by due date; done tasks sit in their own group at the end.
  const groups = [
    ...DUE_GROUPS.map((g) => ({ label: g as string, items: visible.filter((t) => t.status !== "DONE" && dueGroup(t.dueDate && toIso(t.dueDate), today) === g) })),
    { label: "Done", items: visible.filter((t) => t.status === "DONE") },
  ].filter((g) => g.items.length);

  return (
    <div className="flex max-w-[980px] flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-[10px] bg-gray-100 p-1">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/tasks?tab=${k}`} className={`flex h-8 items-center rounded-[7px] px-3.5 text-[13px] font-bold ${tab === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(31,33,36,.08)]" : "text-gray-600"}`}>
              {label} · {counts[k]}
            </Link>
          ))}
        </div>
        <Link href="/tasks/new" className="btn btn-accent h-[38px]">+ New task</Link>
      </div>

      {groups.length === 0 && <p className="card text-sm text-gray-500">{tab === "done" ? "Nothing finished yet." : "No tasks assigned to you. Tasks your team assigns you show up here."}</p>}
      {groups.map((g) => (
        <section key={g.label} className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2 px-1">
            <h2 className={`text-sm font-extrabold ${g.label === "Overdue" ? "text-brand-700" : ""}`}>{g.label}</h2>
            <span className="font-mono text-xs font-medium text-gray-500">{g.items.length}</span>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-gray-200 bg-white">
            {g.items.map((t, i) => {
              const isDone = t.status === "DONE";
              const due = t.dueDate && toIso(t.dueDate);
              const urgent = !isDone && ["Overdue", "Today"].includes(dueGroup(due, today));
              return (
                <div key={t.id} className={`grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3.5 px-[18px] py-3.5 sm:grid-cols-[24px_minmax(0,1fr)_130px_70px_90px] ${i ? "border-t border-[#f0ece6]" : ""}`}>
                  <TaskCheck id={t.id} done={isDone} />
                  <Link href={`/tasks/${t.id}`} className="flex min-w-0 flex-col gap-0.5">
                    <span className={`truncate text-sm font-semibold ${isDone ? "text-[#9a9da2] line-through" : ""}`}>{t.title}</span>
                    <span className="text-xs text-gray-500">{t.kind}</span>
                  </Link>
                  <span className="hidden text-[13px] text-gray-700 sm:block">{t.department?.name ?? "—"}</span>
                  <span className="hidden sm:block"><PriorityPill p={t.priority} /></span>
                  <span className={`text-right font-mono text-xs font-medium ${urgent ? "text-brand-700" : "text-gray-600"}`}>{dueLabel(due, today)}</span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export const metadata = { title: "My tasks" };

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { canEditTask, canMoveTask, dueLabel } from "@/lib/task-rules";
import { teamsWithMembers } from "@/lib/task-queries";
import { ActionForm } from "../../action-form";
import ConfirmDialog from "../../confirm-dialog";
import { SubmitButton } from "../../../submit-button";
import { PriorityPill, TASK_COLUMNS } from "../../ui";
import { deleteTask, setTaskStatus, updateTask } from "../actions";
import { TaskFields } from "../task-fields";

export default async function TaskPage({ params }: PageProps<"/tasks/[id]">) {
  const me = await requireUser();
  const id = Number((await params).id);
  const task = Number.isInteger(id)
    ? await db.task.findUnique({ where: { id }, include: { department: true, assignee: true, createdBy: true } })
    : null;
  if (!task) notFound();
  const [today, all] = await Promise.all([todayIso(), teamsWithMembers()]);
  const editable = canEditTask(me, task);
  const teams = me.role === "ADMIN" ? all : all.filter((t) => t.id === me.departmentId || t.id === task.departmentId);

  return (
    <div className="max-w-2xl space-y-4">
      <Link href={`/tasks/board?team=${task.departmentId ?? "all"}`} className="link text-sm">← {task.department?.name ?? "Task"} board</Link>
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="eyebrow">{task.department?.name ?? "No team"} · {task.kind}</span>
          <PriorityPill p={task.priority} />
        </div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{task.title}</h1>
        {task.description && <p className="text-sm whitespace-pre-wrap text-gray-700">{task.description}</p>}
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="eyebrow">Status</dt><dd className="font-semibold">{TASK_COLUMNS.find((c) => c.status === task.status)?.name}</dd></div>
          <div><dt className="eyebrow">Assignee</dt><dd className="font-semibold">{task.assignee?.name ?? "Unassigned"}</dd></div>
          <div><dt className="eyebrow">Due</dt><dd className="font-mono">{dueLabel(task.dueDate && toIso(task.dueDate), today)}</dd></div>
          <div><dt className="eyebrow">Created by</dt><dd>{task.createdBy.name}</dd></div>
        </dl>
        {!editable && canMoveTask(me, task) && (
          <div className="flex flex-wrap gap-2 pt-1">
            {TASK_COLUMNS.filter((c) => c.status !== task.status).map((c) => (
              <form key={c.status} action={setTaskStatus.bind(null, task.id, c.status)}>
                <SubmitButton className="btn btn-sm" pendingText="Moving…">Move to {c.name}</SubmitButton>
              </form>
            ))}
          </div>
        )}
      </div>

      {editable && (
        <>
          <ActionForm action={updateTask.bind(null, task.id)} submit="Save changes">
            <h2 className="card-title">Edit task</h2>
            <TaskFields teams={teams} task={task} canAssignOthers={me.role !== "EMPLOYEE"} defaultAssignee={me.role === "EMPLOYEE" ? me.id : undefined} />
          </ActionForm>
          <ConfirmDialog
            title="Delete this task?"
            description={`"${task.title}" will be removed for everyone. This can't be undone.`}
            confirmText="Delete task"
            triggerText="Delete task"
            triggerClassName="btn btn-sm text-red-700"
            confirmClassName="btn btn-danger"
            action={deleteTask.bind(null, task.id)}
          />
        </>
      )}
    </div>
  );
}

export const metadata = { title: "Task" };

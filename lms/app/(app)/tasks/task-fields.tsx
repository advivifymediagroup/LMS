import type { Task } from "@prisma/client";
import { toIso } from "@/lib/leave-days";
import { TASK_COLUMNS } from "../ui";

type Team = { id: number; name: string; users: { id: number; name: string }[] };

/** Fields shared by the new-task and edit-task forms. */
export function TaskFields({ teams, task, defaultTeam, defaultAssignee, canAssignOthers }: {
  teams: Team[];
  task?: Task;
  defaultTeam?: number;
  defaultAssignee?: number;
  canAssignOthers: boolean;
}) {
  return (
    <>
      <div>
        <label className="label" htmlFor="title">Title</label>
        <input className="input" id="title" name="title" required minLength={3} maxLength={200} defaultValue={task?.title} />
      </div>
      <div>
        <label className="label" htmlFor="description">Details (optional)</label>
        <textarea className="input" id="description" name="description" rows={3} maxLength={5000} defaultValue={task?.description ?? ""} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="departmentId">Team</label>
          <select className="input" id="departmentId" name="departmentId" required defaultValue={task?.departmentId ?? defaultTeam ?? ""}>
            <option value="" disabled>Choose…</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="assigneeId">Assignee</label>
          {/* Grouped by team; the server checks the assignee belongs to the chosen team. */}
          <select className="input" id="assigneeId" name="assigneeId" defaultValue={task?.assigneeId ?? defaultAssignee ?? ""}>
            <option value="">Unassigned</option>
            {teams.map((t) => (
              <optgroup key={t.id} label={t.name}>
                {t.users.filter((u) => canAssignOthers || u.id === defaultAssignee).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="priority">Priority</label>
          <select className="input" id="priority" name="priority" defaultValue={task?.priority ?? "MED"}>
            <option value="HIGH">High</option>
            <option value="MED">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="dueDate">Due date</label>
          <input className="input" id="dueDate" name="dueDate" type="date" defaultValue={task?.dueDate ? toIso(task.dueDate) : ""} />
        </div>
        <div>
          <label className="label" htmlFor="status">Status</label>
          <select className="input" id="status" name="status" defaultValue={task?.status ?? "TODO"}>
            {TASK_COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">Kind</label>
          <input className="input" id="kind" name="kind" list="task-kinds" maxLength={40} placeholder="Task" defaultValue={task?.kind ?? ""} />
          <datalist id="task-kinds">
            {["Task", "Project task", "Review", "Meeting", "Admin", "Onboarding", "Training"].map((k) => <option key={k} value={k} />)}
          </datalist>
        </div>
      </div>
    </>
  );
}

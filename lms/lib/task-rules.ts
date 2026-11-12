// Pure task helpers. No imports so they run under `node --test` as-is.
// Dates are ISO "YYYY-MM-DD" strings (calendar days in the company timezone).

export type DueGroup = "Overdue" | "Today" | "This week" | "Later" | "No due date";
export const DUE_GROUPS: DueGroup[] = ["Overdue", "Today", "This week", "Later", "No due date"];

/** Which bucket an open task falls in. "This week" means the next 7 days. */
export function dueGroup(due: string | null, today: string): DueGroup {
  if (!due) return "No due date";
  if (due < today) return "Overdue";
  if (due === today) return "Today";
  const week = new Date(today + "T00:00:00Z");
  week.setUTCDate(week.getUTCDate() + 7);
  return due <= week.toISOString().slice(0, 10) ? "This week" : "Later";
}

/** "Today", "Tomorrow", or "Nov 14". */
export function dueLabel(due: string | null, today: string): string {
  if (!due) return "—";
  if (due === today) return "Today";
  const tomorrow = new Date(today + "T00:00:00Z");
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  if (due === tomorrow.toISOString().slice(0, 10)) return "Tomorrow";
  return shortDate(due);
}

export function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

type Actor = { id: number; role: "ADMIN" | "LEAD" | "EMPLOYEE"; departmentId: number | null };
type TaskRef = { createdById: number; assigneeId: number | null; departmentId: number | null };

/** Full edit (title, team, assignee, delete): admins, the team's lead, and whoever created it. */
export function canEditTask(me: Actor, t: TaskRef): boolean {
  return me.role === "ADMIN" || t.createdById === me.id || (me.role === "LEAD" && t.departmentId !== null && t.departmentId === me.departmentId);
}

/** Moving a task between columns: anyone who can edit it, plus the assignee. */
export function canMoveTask(me: Actor, t: TaskRef): boolean {
  return canEditTask(me, t) || t.assigneeId === me.id;
}

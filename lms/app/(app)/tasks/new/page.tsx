import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { teamsWithMembers } from "@/lib/task-queries";
import { ActionForm } from "../../action-form";
import { createTask } from "../actions";
import { TaskFields } from "../task-fields";

export default async function NewTaskPage({ searchParams }: PageProps<"/tasks/new">) {
  const me = await requireUser();
  const { team } = await searchParams;
  const all = await teamsWithMembers();
  // Admins can add to any team; everyone else to their own.
  const teams = me.role === "ADMIN" ? all : all.filter((t) => t.id === me.departmentId);
  const defaultTeam = Number(team) && teams.some((t) => t.id === Number(team)) ? Number(team) : me.departmentId ?? undefined;

  return (
    <div className="max-w-2xl">
      <Link href="/tasks/board" className="link text-sm">← Task board</Link>
      <h1 className="h1 mt-2">New task</h1>
      {teams.length === 0 ? (
        <p className="notice">You&apos;re not in a team yet. Ask an admin to add you to one.</p>
      ) : (
        <ActionForm action={createTask} submit="Create task" submitClass="btn btn-accent">
          <TaskFields teams={teams} defaultTeam={defaultTeam} defaultAssignee={me.role === "EMPLOYEE" ? me.id : undefined} canAssignOthers={me.role !== "EMPLOYEE"} />
        </ActionForm>
      )}
    </div>
  );
}

export const metadata = { title: "New task" };

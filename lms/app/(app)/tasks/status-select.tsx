"use client";

import { useTransition } from "react";
import type { TaskStatus } from "@prisma/client";
import { setTaskStatus } from "./actions";

const OPTIONS: [TaskStatus, string][] = [["TODO", "To do"], ["DOING", "In progress"], ["REVIEW", "In review"], ["DONE", "Done"]];

/** Moves a board card to another column as soon as a new status is picked. */
export function StatusSelect({ id, status }: { id: number; status: TaskStatus }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Move to"
      value={status}
      disabled={pending}
      onChange={(e) => start(() => setTaskStatus(id, e.target.value as TaskStatus))}
      className="h-7 cursor-pointer rounded-md border border-gray-300 bg-white px-1.5 text-[11.5px] font-semibold text-gray-700 outline-none disabled:opacity-50"
    >
      {OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

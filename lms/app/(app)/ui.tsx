// Small shared pieces of the portal design. Server components unless noted.
import Link from "next/link";
import type { TaskPriority, TaskStatus } from "@prisma/client";
import { initials } from "@/lib/task-rules";
import { setTaskStatus } from "./tasks/actions";

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  return <span className={`avatar ${className}`} title={name}>{initials(name)}</span>;
}

export function StatCard({ label, value, note, warn, href }: { label: string; value: React.ReactNode; note?: string; warn?: boolean; href?: string }) {
  const body = (
    <>
      <div className="text-[12.5px] font-semibold text-gray-600">{label}</div>
      <div className="num text-[30px] text-ink">{value}</div>
      {note && <div className={`text-xs font-semibold ${warn ? "text-brand-700" : "text-gray-600"}`}>{note}</div>}
    </>
  );
  const cls = "flex flex-col gap-2.5 rounded-[14px] border border-gray-200 bg-white p-[18px]";
  return href ? <Link href={href} className={`${cls} hover:border-gray-400`}>{body}</Link> : <div className={cls}>{body}</div>;
}

const PRIORITY: Record<TaskPriority, [string, string]> = {
  HIGH: ["High", "bg-brand-50 text-brand-700"],
  MED: ["Med", "bg-gray-100 text-char"],
  LOW: ["Low", "text-gray-500"],
};
export function PriorityPill({ p }: { p: TaskPriority }) {
  return <span className={`pill px-2 py-0.5 text-[11px] ${PRIORITY[p][1]}`}>{PRIORITY[p][0]}</span>;
}

export const TASK_COLUMNS: { status: TaskStatus; name: string; dot: string }[] = [
  { status: "TODO", name: "To do", dot: "bg-gray-400" },
  { status: "DOING", name: "In progress", dot: "bg-brand-500" },
  { status: "REVIEW", name: "In review", dot: "bg-char" },
  { status: "DONE", name: "Done", dot: "bg-gray-500" },
];

/** Checkbox that marks a task done (or reopens it). */
export function TaskCheck({ id, done, disabled }: { id: number; done: boolean; disabled?: boolean }) {
  return (
    <form action={setTaskStatus.bind(null, id, done ? "TODO" : "DONE")}>
      <button
        disabled={disabled}
        aria-label={done ? "Reopen task" : "Mark done"}
        className={`grid size-5 cursor-pointer place-items-center rounded-md border-[1.5px] text-xs font-extrabold text-ink disabled:cursor-default ${done ? "border-brand-500 bg-brand-500" : "border-[#c9c4bc] bg-transparent hover:border-char"}`}
      >
        {done ? "✓" : ""}
      </button>
    </form>
  );
}

// Leave type colours (design: Annual charcoal, Sick orange, Casual stone, Unpaid sand).
const TYPE_COLOR: Record<string, string> = { CL: "#2F3237", SL: "#FF6B1A", OL: "#A8A39B", LWP: "#D9D4CC" };
export const typeColor = (code: string) => TYPE_COLOR[code] ?? "#8A8D92";
export function TypeDot({ code }: { code: string }) {
  return <span className="inline-block size-2 flex-none rounded-[2px]" style={{ background: typeColor(code) }} />;
}

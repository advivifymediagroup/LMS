"use client";

import { useActionState, useState } from "react";
import type { ReportData, ReportProject } from "@/lib/team-config";
import type { FormState } from "../admin/actions";
import { SubmitButton } from "../../submit-button";

type Hints = Partial<Record<keyof ReportData, string>>;

function Area({ name, label, value, hint, rows = 4, list }: { name: string; label: string; value: string | string[]; hint?: string; rows?: number; list?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {(hint || list) && <p className="mb-1.5 text-[12.5px] text-gray-500">{hint}{list && `${hint ? " " : ""}One per line.`}</p>}
      <textarea className="input" id={name} name={name} rows={rows} defaultValue={Array.isArray(value) ? value.join("\n") : value} />
    </div>
  );
}

export function ReportForm({ action, designation, data, hints, projectsTitle, statuses }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  designation: string; data: ReportData; hints: Hints; projectsTitle: string; statuses: string[];
}) {
  const [state, formAction] = useActionState(action, null);
  const [projects, setProjects] = useState<ReportProject[]>(data.projects.length ? data.projects : [{ name: "", status: "In Progress", outcome: "" }]);

  return (
    <form action={formAction} className="card space-y-5">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      <div>
        <label className="label" htmlFor="designation">Designation</label>
        <input className="input" id="designation" name="designation" maxLength={120} defaultValue={designation} placeholder="e.g. Software Engineer (Full Stack)" />
      </div>
      <Area name="summary" label="Summary" value={data.summary} hint={hints.summary} rows={6} />
      <Area name="responsibilities" label="Responsibilities" value={data.responsibilities} hint={hints.responsibilities} list rows={5} />
      <Area name="achievements" label="Key achievements" value={data.achievements} hint={hints.achievements} list rows={5} />

      <fieldset className="space-y-2">
        <legend className="label">{projectsTitle}</legend>
        {hints.projects && <p className="text-[12.5px] text-gray-500">{hints.projects}</p>}
        {projects.map((p, i) => (
          <div key={i} className="grid gap-2 rounded-[10px] border border-gray-200 p-3 sm:grid-cols-[1fr_150px]">
            <input className="input" name={`p_name_${i}`} defaultValue={p.name} placeholder="Task / project" aria-label={`Project ${i + 1} name`} />
            <select className="input" name={`p_status_${i}`} defaultValue={p.status} aria-label={`Project ${i + 1} status`}>
              {statuses.map((s) => <option key={s}>{s}</option>)}
            </select>
            <textarea className="input sm:col-span-2" name={`p_outcome_${i}`} rows={2} defaultValue={p.outcome} placeholder="Outcome / impact" aria-label={`Project ${i + 1} outcome`} />
          </div>
        ))}
        <button type="button" className="btn btn-sm" onClick={() => setProjects([...projects, { name: "", status: "In Progress", outcome: "" }])}>+ Add row</button>
        <p className="text-[12.5px] text-gray-500">Leave the name empty to drop a row.</p>
      </fieldset>

      <Area name="challenges" label="Challenges / roadblocks" value={data.challenges} hint={hints.challenges} />
      <Area name="support" label="Support required (if any)" value={data.support} rows={3} />
      <Area name="learning" label="Learning & skill development" value={data.learning} hint={hints.learning} list />
      <Area name="highlights" label="Performance highlights" value={data.highlights} hint={hints.highlights ?? "Up to three."} list rows={3} />
      <Area name="selfAssessment" label="Self assessment / learnings" value={data.selfAssessment} rows={5} />
      <Area name="objectives" label="Objectives of next month" value={data.objectives} hint={hints.objectives} list />

      <div className="flex flex-wrap gap-2 border-t border-gray-200 pt-4">
        <SubmitButton name="intent" value="save" className="btn" pendingText="Saving…">Save draft</SubmitButton>
        <SubmitButton name="intent" value="submit" className="btn btn-accent" pendingText="Submitting…">Submit report</SubmitButton>
        <p className="w-full text-[12.5px] text-gray-500">Once submitted, your lead can comment on it. They can return it to you if it needs changes.</p>
      </div>
    </form>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ImportState } from "./actions";
import { SubmitButton } from "../../submit-button";

/** Upload → preview with errors → fix (in the file, or in the text box) → import. */
export function ImportForm({ action, base }: { action: (s: ImportState, f: FormData) => Promise<ImportState>; base: string }) {
  const [state, formAction] = useActionState(action, null);
  const rows = state?.rows ?? [];
  const bad = rows.filter((r) => r.error).length;

  if (state?.done)
    return (
      <div className="card space-y-2">
        <p className="success">{state.ok}</p>
        <p className="text-sm">Upload ID <span className="font-mono">{state.done.importId}</span>. It&apos;s shown on each record and in its history.</p>
        <div className="flex gap-2"><Link className="btn btn-accent btn-sm" href={base}>See the records</Link><a className="btn btn-sm" href={`${base}/import`}>Upload another file</a></div>
      </div>
    );

  return (
    <form action={formAction} className="card space-y-3">
      {state?.error && <p className="error">{state.error}</p>}
      <div>
        <label className="label" htmlFor="file">{state?.csv ? "Upload a corrected file (optional)" : "Filled-in template (CSV)"}</label>
        <input className="input" id="file" name="file" type="file" accept=".csv,text/csv" required={!state?.csv} />
      </div>
      {state?.csv != null && (
        <div>
          <label className="label" htmlFor="csv">Or fix the rows here</label>
          <textarea key={state.csv} className="input font-mono text-[12px]" id="csv" name="csv" rows={Math.min(14, state.csv.split("\n").length + 1)} defaultValue={state.csv} spellCheck={false} />
        </div>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-sm">
            <b>{rows.length - bad}</b> of {rows.length} rows are ready.{" "}
            {bad ? <span className="font-semibold text-red-700">{bad} need fixing; nothing is saved until every row is right.</span> : "Check them, then import."}
          </p>
          <div className="max-h-[420px] overflow-auto rounded-[10px] border border-gray-200">
            <table className="table min-w-[760px]">
              <thead><tr><th>Line</th><th>Client · campaign</th><th>Month</th><th>GEO</th><th className="text-right">Approved conv.</th><th className="text-right">Net</th><th>Check</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className={r.error ? "bg-red-50" : ""}>
                    <td className="font-mono text-[12.5px]">{r.line}</td>
                    <td className="text-[13px]">{r.what || "—"}</td>
                    <td className="font-mono text-[12.5px]">{r.month}</td>
                    <td className="font-mono text-[12.5px]">{r.geo}</td>
                    <td className="text-right font-mono text-[12.5px]">{r.approved}</td>
                    <td className="text-right font-mono text-[12.5px]">{r.net}</td>
                    <td className={`text-[13px] ${r.error ? "font-semibold text-red-700" : "text-gray-600"}`}>{r.error ?? "OK"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton name="intent" value="check" className={`btn btn-sm ${rows.length && !bad ? "" : "btn-accent"}`} pendingText="Checking…">{rows.length ? "Check again" : "Check file"}</SubmitButton>
        {rows.length > 0 && !bad && (
          <>
            <SubmitButton name="intent" value="import" className="btn btn-accent btn-sm" pendingText="Importing…">Import {rows.length} record{rows.length === 1 ? "" : "s"}</SubmitButton>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="submit" /> Submit them for review straight away (otherwise saved as drafts)</label>
          </>
        )}
      </div>
    </form>
  );
}

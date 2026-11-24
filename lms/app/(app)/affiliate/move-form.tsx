"use client";

import { useActionState } from "react";
import type { FormState } from "../admin/actions";
import { SubmitButton } from "../../submit-button";

/** One note box and a button per allowed status change. */
export function MoveForm({ action, moves, notesFor }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  moves: { to: string; label: string }[];
  notesFor: string[];
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-2.5">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      <textarea className="input" name="note" rows={2} maxLength={2000} aria-label="Note" placeholder={notesFor.length ? `Note (optional; required if ${notesFor.join(" or ")})` : "Note (optional)"} />
      <div className="flex flex-wrap gap-2">
        {moves.map((m, i) => (
          <SubmitButton key={m.to} name="to" value={m.to} className={`btn btn-sm ${i === 0 ? "btn-accent" : ""}`} pendingText="Updating…">{m.label}</SubmitButton>
        ))}
      </div>
    </form>
  );
}

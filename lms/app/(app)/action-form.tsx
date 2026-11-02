"use client";

import { useActionState } from "react";
import type { FormState } from "./admin/actions";

/** A form wired to a server action that returns { error } or { ok }, shown above the fields. */
export function ActionForm({ action, children, submit, className = "card space-y-4", submitClass = "btn btn-primary" }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  children?: React.ReactNode;
  submit: string;
  className?: string;
  submitClass?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className={className}>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      {children}
      <button className={submitClass} disabled={pending}>{pending ? "Working…" : submit}</button>
    </form>
  );
}

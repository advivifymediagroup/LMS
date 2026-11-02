"use client";

import { useActionState } from "react";
import type { FormState } from "../../actions";

export function ResetPassword({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="card max-w-xl space-y-3">
      <h2 className="font-medium">Reset password</h2>
      {state?.ok && (
        <p className="success">
          {state.ok} Temporary password: <code className="font-mono font-semibold">{state.tempPassword}</code>
        </p>
      )}
      <button className="btn" disabled={pending}>Generate temporary password</button>
    </form>
  );
}

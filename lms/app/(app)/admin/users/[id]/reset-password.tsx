"use client";

import { useActionState } from "react";
import { SubmitButton } from "../../../../submit-button";
import type { FormState } from "../../actions";

export function ResetPassword({ action }: { action: (s: FormState) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="card max-w-xl space-y-3">
      <h2 className="font-medium">Reset password</h2>
      {state?.ok && (
        <p className="success">
          {state.ok} Temporary password: <code className="font-mono font-semibold">{state.tempPassword}</code>
        </p>
      )}
      <SubmitButton className="btn" pendingText="Generating password…">Generate temporary password</SubmitButton>
    </form>
  );
}

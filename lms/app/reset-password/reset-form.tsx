"use client";

import { useActionState } from "react";
import { SubmitButton } from "../submit-button";

export function ResetForm({ action }: { action: (s: string | null, f: FormData) => Promise<string | null> }) {
  const [error, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className="card w-full max-w-sm space-y-4">
      <h1 className="text-xl font-semibold">Set a new password</h1>
      <p className="text-sm text-gray-600">At least 8 characters, with a letter and a number.</p>
      {error && <p className="error">{error}</p>}
      <div>
        <label className="label" htmlFor="next">New password</label>
        <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
      </div>
      <div>
        <label className="label" htmlFor="confirm">Confirm new password</label>
        <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <SubmitButton className="btn btn-primary w-full" pendingText="Saving password…">Save password</SubmitButton>
    </form>
  );
}

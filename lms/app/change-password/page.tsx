"use client";

import { useActionState } from "react";
import { SubmitButton } from "../submit-button";
import { changePassword } from "../login/actions";

export default function ChangePasswordPage() {
  const [error, action] = useActionState(changePassword, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Change password</h1>
        <p className="text-sm text-gray-600">At least 8 characters, with a letter and a number.</p>
        {error && <p className="error">{error}</p>}
        <div>
          <label className="label" htmlFor="current">Current password</label>
          <input className="input" id="current" name="current" type="password" autoComplete="current-password" required />
        </div>
        <div>
          <label className="label" htmlFor="next">New password</label>
          <input className="input" id="next" name="next" type="password" autoComplete="new-password" minLength={8} required />
        </div>
        <div>
          <label className="label" htmlFor="confirm">Confirm new password</label>
          <input className="input" id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        </div>
        <SubmitButton className="btn btn-primary w-full hover:cursor-pointer" pendingText="Saving password…">Save password</SubmitButton>
      </form>
    </main>
  );
}

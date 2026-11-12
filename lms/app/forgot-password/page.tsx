"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset } from "../login/actions";

export default function ForgotPasswordPage() {
  const [message, action, pending] = useActionState(requestPasswordReset, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Forgot password</h1>
        <p className="text-sm text-gray-600">We will email you a link to set a new password. It works for 1 hour.</p>
        {message && <p className="notice">{message}</p>}
        <div>
          <label className="label" htmlFor="identifier">Employee ID or email</label>
          <input className="input" id="identifier" name="identifier" autoComplete="username" required />
        </div>
        <button className="btn btn-primary w-full hover:cursor-pointer" disabled={pending}>Send reset link</button>
        <Link href="/login" className="block text-center text-sm text-brand-600">Back to sign in</Link>
      </form>
    </main>
  );
}

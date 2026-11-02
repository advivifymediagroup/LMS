"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Leave Management</h1>
        {error && <p className="error">{error}</p>}
        <div>
          <label className="label" htmlFor="identifier">Employee ID or email</label>
          <input className="input" id="identifier" name="identifier" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary w-full" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <p className="text-xs text-gray-500">Forgot your password? Ask an admin to reset it.</p>
      </form>
    </main>
  );
}

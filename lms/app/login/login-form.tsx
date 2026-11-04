"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={action} className="card w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Leave Management</h1>
        {notice && !error && <p className="success">{notice}</p>}
        {error && <p className="error">{error}</p>}
        <div>
          <label className="label" htmlFor="identifier">Employee ID or email</label>
          <input className="input" id="identifier" name="identifier" autoComplete="username" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn btn-primary w-full hover:cursor-pointer" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
        <Link href="/forgot-password" className="block text-center text-sm text-blue-600">Forgot password?</Link>
      </form>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "./actions";
import { Logo } from "../logo";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, action, pending] = useActionState(login, null);
  return (
    <main className="grid min-h-screen bg-paper md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col justify-between gap-12 bg-char px-8 py-10 text-paper md:px-14 md:py-12">
        <Logo size={38} dark />
        <div className="flex max-w-[440px] flex-col gap-5">
          <div className="font-mono text-xs font-medium tracking-[.12em] text-brand-400 uppercase">Company portal</div>
          <h1 className="text-[34px] leading-[1.08] font-extrabold tracking-[-0.03em] text-pretty md:text-[44px]">Leave and tasks for every team, in one place.</h1>
          <p className="text-base leading-relaxed text-pretty text-[#c4c7cc]">
            Leave requests, approvals and team tasks for Development, Sales, Marketing, Media Buying, Design and Finance.
          </p>
        </div>
        <div className="font-mono text-xs text-[#8d9096]">© {new Date().getFullYear()} Advivify · Internal use only</div>
      </div>

      <div className="flex items-center justify-center px-6 py-12 md:px-14">
        <form action={action} className="flex w-full max-w-[440px] flex-col gap-7">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-[28px] font-extrabold tracking-[-0.02em]">Sign in</h2>
            <p className="text-[15px] text-gray-600">Use your Employee ID or work email.</p>
          </div>
          {notice && !error && <p className="success">{notice}</p>}
          {error && <p className="error">{error}</p>}
          <div className="flex flex-col gap-3.5">
            <div>
              <label className="label" htmlFor="identifier">Employee ID or work email</label>
              <input className="input h-[46px] text-[15px]" id="identifier" name="identifier" autoComplete="username" required />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input className="input h-[46px] text-[15px]" id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4">
            <Link href="/forgot-password" className="link text-[13px]">Forgot password?</Link>
            <button className="btn btn-accent h-12 px-7 text-[15px]" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</button>
          </div>
        </form>
      </div>
    </main>
  );
}

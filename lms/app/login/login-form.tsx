"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../submit-button";
import { login } from "./actions";
import { Logo } from "../logo";

export function LoginForm({ notice, googleError, googleEnabled }: {
  notice?: string;
  googleError?: string;
  googleEnabled: boolean;
}) {
  const [error, action] = useActionState(login, null);
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
          {notice && !error && !googleError && <p className="success">{notice}</p>}
          {googleError && <p className="error">{googleError}</p>}
          {error && <p className="error">{error}</p>}
          {googleEnabled && (
            <>
              <a href="/login/google" className="btn flex h-12 w-full items-center justify-center gap-3 text-[15px]" >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 48 48"
                className="h-5 w-5 shrink-0"
              >
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.93c-.58 2.96-2.24 5.48-4.7 7.18l7.56 5.87c4.41-4.07 7.19-10.08 7.19-17.52z" />
                <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a23.9 23.9 0 0 0 0 21.56z" />
                <path fill="#34A853" d="M24 48c6.47 0 11.93-2.13 15.9-5.93l-7.56-5.87c-2.1 1.41-4.79 2.25-8.34 2.25-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>Sign in with Google</span>
            </a>
          <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="h-px flex-1 bg-gray-200" />
                <span>or sign in with your work account</span>
                <span className="h-px flex-1 bg-gray-200" />
              </div>
            </>
          )}
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
            <SubmitButton className="btn btn-accent h-12 px-7 text-[15px]" pendingText="Signing in…">Sign in</SubmitButton>
          </div>
        </form>
      </div>
    </main>
  );
}

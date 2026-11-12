import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";

type SessionData = { userId?: number };

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), {
    password: process.env.SESSION_SECRET!,
    cookieName: "lms_session",
    ttl: 60 * 60 * 12,
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: (process.env.APP_URL ?? "").startsWith("https:") },
  });
}

export async function currentUser() {
  const session = await getSession();
  if (!session.userId) return null;
  const user = await db.user.findUnique({ where: { id: session.userId } });
  return user?.isActive ? user : null;
}

/**
 * Use in every page AND every server action (actions skip layouts).
 * Redirects to login, to the forced password change, or to the dashboard when the role is wrong.
 */
export async function requireUser(roles?: Role[], opts: { allowPasswordChange?: boolean } = {}) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPasswordChange) redirect("/change-password");
  if (roles && !roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "Password must be at least 8 characters.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Password must contain a letter and a number.";
  return null;
}

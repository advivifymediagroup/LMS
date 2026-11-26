"use server";

import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, passwordProblem, requireUser } from "@/lib/auth";
import { appUrl, sendPasswordReset } from "@/lib/notify";
import { clearLimit, limited, TOO_MANY } from "@/lib/rate-limit";

const MIN = 60 * 1000;
/** The visitor's address, as set by nginx (the visitor can't supply X-Real-IP). */
const clientIp = async () => (await headers()).get("x-real-ip") ?? "local";

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const id = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!id || !password) return "Enter your Employee ID or email and password.";
  // 5 tries per account and 100 per address (an office shares one) every 15 minutes; a successful login clears the account's count.
  const account = `login:${id.toLowerCase()}`;
  if (limited(`login-ip:${await clientIp()}`, 100, 15 * MIN) || limited(account, 5, 15 * MIN)) return TOO_MANY;

  const user = await db.user.findFirst({
    where: { OR: [{ employeeId: id.toUpperCase() }, { email: { equals: id, mode: "insensitive" } }] },
  });
  // Same message for unknown user and wrong password.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return "Invalid credentials.";
  if (!user.isActive) return "This account is deactivated. Contact HR.";
  clearLimit(account);

  const session = await getSession();
  session.userId = user.id;
  await session.save();
  redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}

export async function changePassword(_: string | null, form: FormData): Promise<string | null> {
  const user = await requireUser(undefined, { allowPasswordChange: true });
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  if (limited(`change:${user.id}`, 5, 15 * MIN)) return TOO_MANY;
  if (!(await bcrypt.compare(current, user.passwordHash))) return "Current password is wrong.";
  if (next !== form.get("confirm")) return "New passwords don't match.";
  if (next === current) return "New password must be different.";
  const problem = passwordProblem(next);
  if (problem) return problem;

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false },
  });
  redirect("/dashboard");
}

// ---------- Forgot / reset password ----------

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");
const RESET_SENT = "If that account exists, a reset link is on its way to its email.";

export async function requestPasswordReset(_: string | null, form: FormData): Promise<string | null> {
  const id = String(form.get("identifier") ?? "").trim();
  if (!id) return "Enter your Employee ID or email.";
  // 3 emails per account and 10 per address an hour, so the form can't be used to flood inboxes.
  if (limited(`reset-ip:${await clientIp()}`, 10, 60 * MIN) || limited(`reset:${id.toLowerCase()}`, 3, 60 * MIN)) return "Too many reset requests. Try again in an hour.";
  const user = await db.user.findFirst({
    where: { isActive: true, OR: [{ employeeId: id.toUpperCase() }, { email: { equals: id, mode: "insensitive" } }] },
  });
  if (user) {
    const token = crypto.randomBytes(32).toString("base64url");
    await db.passwordReset.deleteMany({ where: { userId: user.id } });
    await db.passwordReset.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
    // Sent after the response so timing doesn't reveal whether the account exists.
    after(() => sendPasswordReset(user, appUrl(`/reset-password?token=${token}`)));
  }
  return RESET_SENT;
}

export async function resetPasswordWithToken(token: string, _: string | null, form: FormData): Promise<string | null> {
  const reset = await db.passwordReset.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!reset || reset.expiresAt < new Date()) return "This link is invalid or has expired. Ask for a new one.";
  const next = String(form.get("next") ?? "");
  if (next !== form.get("confirm")) return "Passwords don't match.";
  const problem = passwordProblem(next);
  if (problem) return problem;
  await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(next, 10), mustChangePassword: false } }),
    db.passwordReset.deleteMany({ where: { userId: reset.userId } }),
  ]);
  redirect("/login?reset=1");
}

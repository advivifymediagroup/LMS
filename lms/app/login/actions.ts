"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, passwordProblem, requireUser } from "@/lib/auth";

export async function login(_: string | null, form: FormData): Promise<string | null> {
  const id = String(form.get("identifier") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!id || !password) return "Enter your Employee ID or email and password.";

  const user = await db.user.findFirst({
    where: { OR: [{ employeeId: id.toUpperCase() }, { email: { equals: id, mode: "insensitive" } }] },
  });
  // Same message for unknown user and wrong password.
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return "Invalid credentials.";
  if (!user.isActive) return "This account is deactivated. Contact HR.";

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

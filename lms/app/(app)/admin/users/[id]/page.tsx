import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toIso } from "@/lib/leave-days";
import { resetPassword, saveUser } from "../../actions";
import { UserForm } from "../user-form";
import { userFormOptions } from "../options";
import { ResetPassword } from "./reset-password";

export default async function EditUserPage({ params }: PageProps<"/admin/users/[id]">) {
  await requireUser(["ADMIN"]);
  const id = Number((await params).id);
  const user = Number.isInteger(id) ? await db.user.findUnique({ where: { id } }) : null;
  if (!user) notFound();
  const { departments, managers } = await userFormOptions();
  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-blue-600">← Users</Link>
      <h1 className="h1">{user.name} <span className="text-base font-normal text-gray-500">{user.employeeId}</span></h1>
      <UserForm
        user={{ ...user, joiningDate: toIso(user.joiningDate) }}
        departments={departments}
        managers={managers.filter((m) => m.id !== user.id)}
        action={saveUser.bind(null, user.id)}
      />
      <ResetPassword action={resetPassword.bind(null, user.id)} />
      <Link className="btn" href={`/admin/balances?userId=${user.id}`}>View / adjust balances</Link>
    </div>
  );
}

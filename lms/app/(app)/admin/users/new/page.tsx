import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { saveUser } from "../../actions";
import { UserForm } from "../user-form";
import { userFormOptions } from "../options";

export default async function NewUserPage() {
  await requireUser(["ADMIN"]);
  const { departments, managers } = await userFormOptions();
  return (
    <div>
      <Link href="/admin/users" className="text-sm text-brand-600">← Users</Link>
      <h1 className="h1 mt-2">New user</h1>
      <p className="mb-4 text-sm text-gray-600">A temporary password is generated; they must change it on first login.</p>
      <UserForm departments={departments} managers={managers} action={saveUser.bind(null, null)} />
    </div>
  );
}
export const metadata = { title: "New user" };

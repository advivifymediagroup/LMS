"use client";

import { useActionState } from "react";
import type { FormState } from "../actions";

type Option = { id: number; name: string };
type UserValues = {
  employeeId: string; name: string; email: string; role: string;
  departmentId: number | null; managerId: number | null; joiningDate: string; isActive: boolean; onNoticePeriod: boolean;
};

export function UserForm({ user, departments, managers, action }: {
  user?: UserValues;
  departments: Option[];
  managers: Option[];
  action: (s: FormState, f: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="card max-w-xl space-y-4">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && (
        <p className="success">
          {state.ok}
          {state.tempPassword && <> Temporary password: <code className="font-mono font-semibold">{state.tempPassword}</code> (shown once).</>}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="employeeId">Employee ID</label>
          <input className="input" id="employeeId" name="employeeId" defaultValue={user?.employeeId} required />
        </div>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input className="input" id="name" name="name" defaultValue={user?.name} required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input className="input" id="email" name="email" type="email" defaultValue={user?.email} required />
        </div>
        <div>
          <label className="label" htmlFor="joiningDate">Joining date</label>
          <input className="input" id="joiningDate" name="joiningDate" type="date" defaultValue={user?.joiningDate} required />
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select className="input" id="role" name="role" defaultValue={user?.role ?? "EMPLOYEE"}>
            <option value="EMPLOYEE">Employee</option>
            <option value="LEAD">Team Lead</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="departmentId">Department</label>
          <select className="input" id="departmentId" name="departmentId" defaultValue={user?.departmentId ?? ""}>
            <option value="">—</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="managerId">Reporting manager (approves their leave)</label>
          <select className="input" id="managerId" name="managerId" defaultValue={user?.managerId ?? ""}>
            <option value="">— none (admins approve)</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {user && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="isActive" defaultChecked={user.isActive} /> Active (untick when someone leaves; history is kept)
          </label>
        )}
        {user && (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="onNoticePeriod" defaultChecked={user.onNoticePeriod} /> Serving notice period (blocks Casual Leave)
          </label>
        )}
      </div>
      <button className="btn btn-primary" disabled={pending}>{user ? "Save changes" : "Create user"}</button>
    </form>
  );
}

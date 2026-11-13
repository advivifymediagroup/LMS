"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "../../../../submit-button";
import { importUsers } from "../../actions";

const SAMPLE = `employee_id,name,email,role,department,manager_employee_id,joining_date,CL,SL,OL
EMP101,Riya Shah,riya@company.com,EMPLOYEE,Engineering,LEAD001,2025-04-01,4.5,3,5`;

export function ImportForm() {
  const [state, action] = useActionState(importUsers, null);
  return (
    <div className="space-y-4">
      <Link href="/admin/users" className="text-sm text-brand-600">← Users</Link>
      <h1 className="h1">Import users (CSV)</h1>
      <div className="card space-y-2 text-sm">
        <p>Columns (header row required). Role is ADMIN, LEAD or EMPLOYEE. Dates are YYYY-MM-DD. Balance columns are optional and set the opening balance.</p>
        <pre className="overflow-x-auto rounded bg-gray-100 p-3 text-xs">{SAMPLE}</pre>
        <p className="text-gray-600">Existing employee IDs are updated, not duplicated. No commas inside values.</p>
      </div>
      <form action={action} className="card flex flex-wrap items-center gap-3">
        <input type="file" name="file" accept=".csv,text/csv" required className="text-sm" />
        <SubmitButton className="btn btn-primary" pendingText="Importing users…">Import</SubmitButton>
      </form>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.rows && (
        <div className="card overflow-x-auto p-0">
          <p className="notice m-3">Temporary passwords are shown once. Copy them now.</p>
          <table className="table">
            <thead><tr><th>Line</th><th>Employee ID</th><th>Result</th><th>Temporary password</th></tr></thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.line}>
                  <td>{r.line}</td><td>{r.employeeId}</td><td>{r.status}</td>
                  <td className="font-mono">{r.tempPassword ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

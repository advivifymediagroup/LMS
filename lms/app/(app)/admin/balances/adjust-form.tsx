"use client";

import { useActionState } from "react";
import { adjustBalance } from "../actions";

export function AdjustForm({ userId, types }: { userId: number; types: { id: number; name: string }[] }) {
  const [state, action, pending] = useActionState(adjustBalance, null);
  return (
    <form action={action} className="card space-y-3">
      <h2 className="font-medium">Manual adjustment</h2>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      <input type="hidden" name="userId" value={userId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_120px_2fr_auto]">
        <select className="input" name="leaveTypeId" required defaultValue="">
          <option value="" disabled>Leave type</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <input className="input" name="days" type="number" step="0.5" placeholder="+/- days" required />
        <input className="input" name="note" placeholder="Reason (required)" required />
        <button className="btn btn-primary" disabled={pending}>Apply</button>
      </div>
    </form>
  );
}

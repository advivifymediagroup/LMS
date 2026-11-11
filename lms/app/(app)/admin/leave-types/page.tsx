import type { LeaveType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "../../action-form";
import { saveLeaveType } from "../policy-actions";

const num = (v: unknown) => (v === null || v === undefined ? "" : Number(v));

function NumberField({ p, name, label, value, step = 1, hint }: { p: string; name: string; label: string; value: unknown; step?: number; hint?: string }) {
  return (
    <div>
      <label className="label" htmlFor={`${p}-${name}`}>{label}</label>
      <input className="input" id={`${p}-${name}`} name={name} type="number" min={0} step={step} defaultValue={num(value)} />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function Check({ name, label, checked }: { name: string; label: string; checked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={checked} /> {label}
    </label>
  );
}

function TypeFields({ t }: { t?: LeaveType }) {
  const p = t?.code ?? "new"; // unique ids per form
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {!t && (
          <div>
            <label className="label" htmlFor="new-code">Code</label>
            <input className="input" id="new-code" name="code" placeholder="e.g. ML" required />
          </div>
        )}
        <div className={t ? "sm:col-span-3" : "sm:col-span-2"}>
          <label className="label" htmlFor={`${p}-name`}>Name</label>
          <input className="input" id={`${p}-name`} name="name" defaultValue={t?.name} required />
        </div>
        <NumberField p={p} name="monthlyCredit" label="Credit per month" value={t?.monthlyCredit ?? 0} step={0.5} />
        <NumberField p={p} name="yearlyQuota" label="Credit per year" value={t?.yearlyQuota ?? 0} step={0.5} hint="Pro-rated for joiners" />
        <NumberField p={p} name="maxCarryForward" label="Carry-forward limit" value={t?.maxCarryForward} step={0.5} hint="Blank = never expires" />
        <NumberField p={p} name="noticeDays" label="Notice (days)" value={t?.noticeDays ?? 0} />
        <NumberField p={p} name="longLeaveDays" label="Longer than (days)…" value={t?.longLeaveDays} hint="Blank = same notice always" />
        <NumberField p={p} name="longNoticeDays" label="…needs notice (days)" value={t?.longNoticeDays ?? 0} />
        <NumberField p={p} name="backdateDays" label="Can apply days back" value={t?.backdateDays ?? 0} hint="0 = future only" />
        <NumberField p={p} name="certificateAfterDays" label="Medical note above (days)" value={t?.certificateAfterDays} hint="Blank = never" />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <Check name="needsBalance" label="Uses a balance (off = unpaid)" checked={t?.needsBalance ?? true} />
        <Check name="allowHalfDay" label="Half days allowed" checked={t?.allowHalfDay ?? true} />
        <Check name="sandwichCounts" label="Count weekends/holidays between leave days (sandwich)" checked={t?.sandwichCounts ?? false} />
        <Check name="optionalHolidayOnly" label="Only on optional holidays" checked={t?.optionalHolidayOnly ?? false} />
        <Check name="blockedOnProbation" label="Not during probation (credits held until it ends)" checked={t?.blockedOnProbation ?? false} />
        <Check name="blockedOnNotice" label="Not during notice period" checked={t?.blockedOnNotice ?? false} />
        <Check name="isActive" label="Active" checked={t?.isActive ?? true} />
      </div>
    </>
  );
}

export default async function LeaveTypesPage() {
  await requireUser(["ADMIN"]);
  const types = await db.leaveType.findMany({ orderBy: { id: "asc" } });
  return (
    <div className="max-w-4xl space-y-6">
      <h1 className="h1">Leave types</h1>
      <p className="text-sm text-gray-600">Changes apply to new applications and future credits. Past leave and balances are not recalculated.</p>
      {types.map((t) => (
        <ActionForm key={t.id} action={saveLeaveType.bind(null, t.id)} submit={`Save ${t.code}`}>
          <h2 className="font-medium">{t.code} · {t.name}{!t.isActive && " (inactive)"}</h2>
          <TypeFields t={t} />
        </ActionForm>
      ))}
      <ActionForm action={saveLeaveType.bind(null, null)} submit="Add leave type">
        <h2 className="font-medium">New leave type</h2>
        <TypeFields />
      </ActionForm>
    </div>
  );
}
export const metadata = { title: "Leave types" };

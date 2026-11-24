"use client";

import { useActionState } from "react";
import type { FormState } from "../admin/actions";
import { SubmitButton } from "../../submit-button";

/** One note box and a button per allowed status change, plus the details some moves record. */
export function MoveForm({ action, moves, notesFor, net, invoiceNumber, today }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  moves: { to: string; label: string }[];
  notesFor: string[];
  /** e.g. "$5,000.00", shown next to the partial approval box. */
  net: string;
  invoiceNumber: string | null;
  today: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const has = (to: string) => moves.some((m) => m.to === to);
  return (
    <form action={formAction} className="space-y-2.5">
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      {has("PARTIALLY_APPROVED") && (
        <div className="max-w-xs">
          <label className="label" htmlFor="approvedAmount">Approved part, for Partially approve (net is {net})</label>
          <input className="input" id="approvedAmount" name="approvedAmount" type="number" min={0} step="0.01" />
        </div>
      )}
      {has("INVOICE_RECEIVED") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="m-invoiceNumber">Publisher invoice number</label><input className="input font-mono" id="m-invoiceNumber" name="invoiceNumber" maxLength={60} defaultValue={invoiceNumber ?? ""} /></div>
          <div><label className="label" htmlFor="m-invoiceDate">Invoice date</label><input className="input" id="m-invoiceDate" name="invoiceDate" type="date" max={today} /></div>
        </div>
      )}
      {has("PAID") && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="paidDate">Paid on</label><input className="input" id="paidDate" name="paidDate" type="date" max={today} defaultValue={today} /></div>
          <div><label className="label" htmlFor="paymentRef">Payment reference / UTR (optional)</label><input className="input font-mono" id="paymentRef" name="paymentRef" maxLength={100} /></div>
        </div>
      )}
      <textarea className="input" name="note" rows={2} maxLength={2000} aria-label="Note" placeholder={notesFor.length ? `Note (optional; required if ${notesFor.join(" or ")})` : "Note (optional)"} />
      <div className="flex flex-wrap gap-2">
        {moves.map((m, i) => (
          <SubmitButton key={m.to} name="to" value={m.to} className={`btn btn-sm ${i === 0 ? "btn-accent" : ""}`} pendingText="Updating…">{m.label}</SubmitButton>
        ))}
      </div>
    </form>
  );
}

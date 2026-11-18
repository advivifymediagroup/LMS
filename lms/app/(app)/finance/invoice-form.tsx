import type { Invoice } from "@prisma/client";
import { toIso } from "@/lib/leave-days";
import type { FormState } from "../admin/actions";
import { ActionForm } from "../action-form";

export function InvoiceForm({ action, invoice, defaults }: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  invoice?: Invoice;
  defaults?: { number: string; issueDate: string; dueDate: string };
}) {
  return (
    <ActionForm action={action} submit={invoice ? "Save changes" : "Create invoice"} submitClass="btn btn-accent">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label className="label" htmlFor="number">Invoice number</label><input className="input font-mono" id="number" name="number" required maxLength={40} defaultValue={invoice?.number ?? defaults?.number} /></div>
        <div><label className="label" htmlFor="client">Client</label><input className="input" id="client" name="client" required maxLength={200} defaultValue={invoice?.client} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="description">What it&apos;s for (optional)</label><input className="input" id="description" name="description" maxLength={2000} defaultValue={invoice?.description ?? ""} /></div>
        <div><label className="label" htmlFor="amount">Amount</label><input className="input" id="amount" name="amount" type="number" step="0.01" min="0.01" required defaultValue={invoice ? Number(invoice.amount) : ""} /></div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <select className="input" id="currency" name="currency" defaultValue={invoice?.currency ?? "INR"}>{["INR", "USD", "AED", "EUR", "GBP"].map((c) => <option key={c}>{c}</option>)}</select>
        </div>
        <div><label className="label" htmlFor="issueDate">Issue date</label><input className="input" id="issueDate" name="issueDate" type="date" required defaultValue={invoice ? toIso(invoice.issueDate) : defaults?.issueDate} /></div>
        <div><label className="label" htmlFor="dueDate">Due date</label><input className="input" id="dueDate" name="dueDate" type="date" required defaultValue={invoice ? toIso(invoice.dueDate) : defaults?.dueDate} /></div>
        <div className="sm:col-span-2"><label className="label" htmlFor="notes">Notes (optional)</label><textarea className="input" id="notes" name="notes" rows={3} maxLength={2000} defaultValue={invoice?.notes ?? ""} /></div>
      </div>
    </ActionForm>
  );
}

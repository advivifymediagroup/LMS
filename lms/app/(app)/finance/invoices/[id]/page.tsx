import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { money, requireFinance } from "@/lib/finance";
import { todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { SubmitButton } from "../../../../submit-button";
import { saveInvoice, setInvoiceStatus } from "../../actions";
import { InvoiceForm } from "../../invoice-form";
import { InvoiceStatus } from "../../invoice-status";

export default async function InvoicePage({ params }: PageProps<"/finance/invoices/[id]">) {
  await requireFinance();
  const id = Number((await params).id);
  const inv = Number.isInteger(id) ? await db.invoice.findUnique({ where: { id }, include: { createdBy: true } }) : null;
  if (!inv) notFound();
  const today = await todayIso();
  const moves = ({ DRAFT: [["SENT", "Mark as sent"], ["CANCELLED", "Cancel"]], SENT: [["PAID", "Mark as paid"], ["CANCELLED", "Cancel"]], PAID: [["SENT", "Undo payment"]], CANCELLED: [["DRAFT", "Restore as draft"]] } as const)[inv.status];

  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/finance" className="link text-sm">← Finance</Link>
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2"><span className="eyebrow font-mono">{inv.number}</span><InvoiceStatus i={inv} today={today} /></div>
        <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{inv.client} · {money(inv.amount, inv.currency)}</h1>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="eyebrow">Issued</dt><dd className="font-mono">{toIso(inv.issueDate)}</dd></div>
          <div><dt className="eyebrow">Due</dt><dd className="font-mono">{toIso(inv.dueDate)}</dd></div>
          <div><dt className="eyebrow">Paid</dt><dd className="font-mono">{inv.paidDate ? toIso(inv.paidDate) : "—"}</dd></div>
          <div><dt className="eyebrow">Created by</dt><dd>{inv.createdBy.name}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-2 pt-1">
          {moves.map(([s, label]) => (
            <form key={s} action={setInvoiceStatus.bind(null, inv.id, s)}>
              <SubmitButton className={`btn btn-sm ${s === "PAID" ? "btn-accent" : ""}`} pendingText="Updating…">{label}</SubmitButton>
            </form>
          ))}
        </div>
      </div>
      <h2 className="card-title">Edit details</h2>
      <InvoiceForm action={saveInvoice.bind(null, inv.id)} invoice={inv} />
    </div>
  );
}

export const metadata = { title: "Invoice" };

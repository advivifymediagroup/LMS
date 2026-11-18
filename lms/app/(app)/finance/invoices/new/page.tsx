import Link from "next/link";
import { nextInvoiceNumber, requireFinance } from "@/lib/finance";
import { todayIso } from "@/lib/leave";
import { addDays } from "@/lib/leave-days";
import { saveInvoice } from "../../actions";
import { InvoiceForm } from "../../invoice-form";

export default async function NewInvoicePage() {
  await requireFinance();
  const today = await todayIso();
  return (
    <div className="max-w-2xl">
      <Link href="/finance" className="link text-sm">← Finance</Link>
      <h1 className="h1 mt-2">New invoice</h1>
      <InvoiceForm action={saveInvoice.bind(null, null)} defaults={{ number: await nextInvoiceNumber(today), issueDate: today, dueDate: addDays(today, 15) }} />
    </div>
  );
}

export const metadata = { title: "New invoice" };

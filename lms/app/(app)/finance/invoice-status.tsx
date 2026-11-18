import type { Invoice } from "@prisma/client";
import { toIso } from "@/lib/leave-days";

export function InvoiceStatus({ i, today }: { i: Invoice; today: string }) {
  const overdue = i.status === "SENT" && toIso(i.dueDate) < today;
  const [label, cls] = overdue ? ["Overdue", "bg-red-50 text-red-800"]
    : i.status === "PAID" ? ["Paid", "bg-char text-paper"]
    : i.status === "SENT" ? ["Sent", "bg-brand-50 text-brand-700"]
    : i.status === "DRAFT" ? ["Draft", "border border-gray-300 text-char"] : ["Cancelled", "bg-gray-100 text-gray-600"];
  return <span className={`pill ${cls}`}>{label}</span>;
}

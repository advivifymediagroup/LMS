import Link from "next/link";
import type { Invoice } from "@prisma/client";
import { db } from "@/lib/db";
import { FINANCE_TEAM, money, requireFinance } from "@/lib/finance";
import { fromIso, todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { dueLabel } from "@/lib/task-rules";
import { PriorityPill, StatCard } from "../ui";
import { InvoiceStatus } from "./invoice-status";

const TABS = [["all", "All"], ["DRAFT", "Draft"], ["SENT", "Sent"], ["overdue", "Overdue"], ["PAID", "Paid"], ["CANCELLED", "Cancelled"]] as const;

/** "₹1,20,000 + $500": totals per currency, never mixed. */
function total(invoices: Invoice[]) {
  const by = new Map<string, number>();
  for (const i of invoices) by.set(i.currency, (by.get(i.currency) ?? 0) + Number(i.amount));
  return by.size ? [...by].map(([c, n]) => money(n, c)).join(" + ") : money(0);
}

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  await requireFinance();
  const q = await searchParams;
  const tab = TABS.find(([k]) => k === q.tab)?.[0] ?? "all";
  const search = typeof q.q === "string" ? q.q.trim() : "";
  const today = await todayIso();
  const day = fromIso(today);
  const monthStart = fromIso(`${today.slice(0, 7)}-01`);

  const [all, financeTeam] = await Promise.all([
    db.invoice.findMany({ orderBy: [{ issueDate: "desc" }, { id: "desc" }] }),
    db.department.findUnique({
      where: { name: FINANCE_TEAM },
      include: { tasks: { where: { status: { not: "DONE" } }, include: { assignee: true }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }], take: 8 } },
    }),
  ]);
  const isOverdue = (i: Invoice) => i.status === "SENT" && i.dueDate < day;
  const outstanding = all.filter((i) => i.status === "SENT");
  const overdue = all.filter(isOverdue);
  const paidMonth = all.filter((i) => i.status === "PAID" && i.paidDate && i.paidDate >= monthStart);
  const drafts = all.filter((i) => i.status === "DRAFT");

  const shown = all
    .filter((i) => tab === "all" || (tab === "overdue" ? isOverdue(i) : i.status === tab))
    .filter((i) => !search || `${i.number} ${i.client} ${i.description ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const counts = Object.fromEntries(TABS.map(([k]) => [k, k === "all" ? all.length : k === "overdue" ? overdue.length : all.filter((i) => i.status === k).length]));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Outstanding" value={total(outstanding)} note={`${outstanding.length} sent, unpaid`} />
        <StatCard label="Overdue" value={total(overdue)} note={`${overdue.length} past due date`} warn={overdue.length > 0} href="/finance?tab=overdue" />
        <StatCard label="Paid this month" value={total(paidMonth)} note={`${paidMonth.length} invoice(s)`} />
        <StatCard label="Drafts" value={drafts.length} note="Not sent yet" href="/finance?tab=DRAFT" />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex flex-wrap gap-1 rounded-[10px] bg-gray-100 p-1">
              {TABS.map(([k, label]) => (
                <Link key={k} href={`/finance?${new URLSearchParams({ ...(k !== "all" && { tab: k }), ...(search && { q: search }) })}`}
                  className={`flex h-8 items-center rounded-[7px] px-3 text-[12.5px] font-bold ${tab === k ? "bg-white text-ink shadow-[0_1px_2px_rgba(31,33,36,.08)]" : "text-gray-600"}`}>
                  {label} · {counts[k]}
                </Link>
              ))}
            </div>
            <form className="flex-1">
              {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
              <input className="input h-10 w-full max-w-[280px]" name="q" defaultValue={search} placeholder="Search number or client" aria-label="Search invoices" />
            </form>
            <Link href="/finance/invoices/new" className="btn btn-accent h-10">+ New invoice</Link>
          </div>
          <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
            <table className="table min-w-[720px]">
              <thead><tr><th>Invoice</th><th>Client</th><th className="text-right">Amount</th><th>Issued</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className="hover:bg-[#fcfbf9]">
                    <td><Link className="link font-mono text-[13px]" href={`/finance/invoices/${i.id}`}>{i.number}</Link></td>
                    <td className="font-semibold">{i.client}{i.description && <div className="truncate text-xs font-normal text-gray-500">{i.description}</div>}</td>
                    <td className="text-right font-mono text-[13px] font-semibold">{money(i.amount, i.currency)}</td>
                    <td className="font-mono text-[12.5px] text-gray-600">{toIso(i.issueDate)}</td>
                    <td className={`font-mono text-[12.5px] ${isOverdue(i) ? "text-red-800" : "text-gray-600"}`}>{toIso(i.dueDate)}</td>
                    <td><InvoiceStatus i={i} today={today} /></td>
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-500">{all.length ? "No invoices match." : "No invoices yet. Create the first one."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="card-title">Finance tasks</h2>
            {financeTeam && <Link className="link text-[13px]" href={`/tasks/board?team=${financeTeam.id}`}>Board →</Link>}
          </div>
          <p className="text-[12.5px] text-gray-500">Includes appraisal and internship-end tasks the portal adds automatically.</p>
          {financeTeam?.tasks.length ? financeTeam.tasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="flex items-start justify-between gap-2 border-t border-[#f0ece6] pt-2.5">
              <span className="min-w-0"><span className="block text-[13.5px] leading-snug font-semibold">{t.title}</span><span className="text-xs text-gray-500">{t.kind} · {t.assignee?.name ?? "Unassigned"}</span></span>
              <span className="flex flex-none flex-col items-end gap-1"><PriorityPill p={t.priority} /><span className="font-mono text-[11.5px] text-gray-600">{dueLabel(t.dueDate && toIso(t.dueDate), today)}</span></span>
            </Link>
          )) : <p className="text-sm text-gray-500">No open tasks.</p>}
        </section>
      </div>
    </div>
  );
}

export const metadata = { title: "Finance" };

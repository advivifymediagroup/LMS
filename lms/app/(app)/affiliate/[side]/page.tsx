import Link from "next/link";
import { notFound } from "next/navigation";
import type { Prisma, ValidationStatus as Status } from "@prisma/client";
import { db } from "@/lib/db";
import { actorFor, requireAffiliate } from "@/lib/affiliate";
import { SIDES, STATUS_LABEL, STATUSES, sideFromSlug } from "@/lib/affiliate-rules";
import { StatCard } from "../../ui";
import { amount, totals, ValidationStatus } from "../ui";

export default async function ValidationsPage({ params, searchParams }: PageProps<"/affiliate/[side]">) {
  const side = sideFromSlug((await params).side);
  if (!side) notFound();
  const a = await requireAffiliate(side);
  const meta = SIDES[side];
  const q = await searchParams;
  const str = (k: string) => (typeof q[k] === "string" ? (q[k] as string).trim() : "");
  const month = /^\d{4}-\d{2}$/.test(str("month")) ? str("month") : "";
  const status = STATUSES[side].includes(str("status") as Status) ? (str("status") as Status) : "";
  const search = str("q");

  const where: Prisma.ValidationWhereInput = {
    side,
    ...(month && { month }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { number: { contains: search, mode: "insensitive" } },
        { campaign: { name: { contains: search, mode: "insensitive" } } },
        { campaign: { advertiser: { name: { contains: search, mode: "insensitive" } } } },
        { publisher: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };
  const rows = await db.validation.findMany({
    where,
    include: { campaign: { include: { advertiser: true } }, publisher: true, createdBy: true },
    orderBy: [{ month: "desc" }, { id: "desc" }],
    take: 500,
  });
  const doneSet: Status[] = side === "SALES" ? ["APPROVED", "PARTIALLY_APPROVED", "CLOSED"] : ["APPROVED", "INVOICE_RECEIVED", "PAYMENT_PENDING", "PAID", "CLOSED"];
  const done = rows.filter((r) => doneSet.includes(r.status));
  const open = rows.filter((r) => r.status !== "DRAFT" && !doneSet.includes(r.status));
  const disputed = rows.filter((r) => r.status === "DISPUTED");
  const canAdd = actorFor(a, side).team || a.admin;
  const base = `/affiliate/${meta.slug}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Records" value={rows.length} note={month ? `For ${month}` : "All months"} />
        <StatCard label={side === "SALES" ? "Approved revenue" : "Approved payouts"} value={totals(done)} note={`${done.length} approved or later`} />
        <StatCard label="In progress" value={totals(open)} note={`${open.length} awaiting a next step`} />
        <StatCard label="Disputed" value={disputed.length} note="Need resolving" warn={disputed.length > 0} href={`${base}?status=DISPUTED`} />
      </div>

      <section className="flex min-w-0 flex-col gap-3">
        <form className="flex flex-wrap items-end gap-2.5">
          <div><label className="label" htmlFor="f-month">Month</label><input className="input h-10" id="f-month" name="month" type="month" defaultValue={month} /></div>
          <div>
            <label className="label" htmlFor="f-status">Status</label>
            <select className="input h-10" id="f-status" name="status" defaultValue={status}>
              <option value="">All statuses</option>
              {STATUSES[side].map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="min-w-[200px] flex-1"><label className="label" htmlFor="f-q">Search</label><input className="input h-10 w-full max-w-[300px]" id="f-q" name="q" defaultValue={search} placeholder={`ID, client, campaign${side === "DELIVERY" ? ", publisher" : ""}`} /></div>
          <button className="btn h-10">Filter</button>
          {(month || status || search) && <Link href={base} className="link h-10 content-center text-sm">Clear</Link>}
          {canAdd && <Link href={`${base}/new`} className="btn btn-accent ml-auto h-10">+ Add new validation</Link>}
        </form>

        <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
          <table className="table min-w-[900px]">
            <thead>
              <tr>
                <th>ID</th><th>Month</th><th>Client · campaign</th>{side === "DELIVERY" && <th>Publisher</th>}<th>GEO</th>
                <th className="text-right">Approved conv.</th><th className="text-right">{side === "SALES" ? "Net revenue" : "Net payable"}</th><th>Status</th><th>Uploaded by</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-[#fcfbf9]">
                  <td><Link className="link font-mono text-[13px]" href={`${base}/${r.id}`}>{r.number}</Link></td>
                  <td className="font-mono text-[12.5px]">{r.month}</td>
                  <td><span className="font-semibold">{r.campaign.advertiser.name}</span><div className="truncate text-xs text-gray-500">{r.campaign.name}</div></td>
                  {side === "DELIVERY" && <td>{r.publisher?.name}</td>}
                  <td className="font-mono text-[12.5px]">{r.geo}</td>
                  <td className="text-right font-mono text-[13px]">{r.approvedConversions.toLocaleString("en-IN")}</td>
                  <td className="text-right font-mono text-[13px] font-semibold">{amount(r.netAmount, r.currency)}</td>
                  <td><ValidationStatus s={r.status} /></td>
                  <td className="text-[13px] text-gray-600">{r.createdBy.name}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="py-8 text-center text-sm text-gray-500">No {meta.label.toLowerCase()} validations{month || status || search ? " match" : " yet"}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps<"/affiliate/[side]">) {
  const side = sideFromSlug((await params).side);
  return { title: side ? `${SIDES[side].label} validations` : "Validations" };
}

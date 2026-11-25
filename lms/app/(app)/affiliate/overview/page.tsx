import Link from "next/link";
import { redirect } from "next/navigation";
import type { ValidationStatus as Status } from "@prisma/client";
import { db } from "@/lib/db";
import { overviewFilter, requireAffiliate, shiftMonth } from "@/lib/affiliate";
import { bucket, counted, OFFER_MODELS, PAYMENT_LABEL, payment, reconcile, STATUS_LABEL, STATUSES, type RecRow } from "@/lib/affiliate-rules";
import { todayIso } from "@/lib/leave";
import { StatCard } from "../../ui";
import { amount } from "../ui";

/** Sums kept per currency; never added across currencies. */
type Money = Map<string, number>;
const add = (m: Money, c: string, n: number) => m.set(c, (m.get(c) ?? 0) + n);
const fmt = (m: Money) => (m.size ? [...m].map(([c, n]) => amount(n, c)).join(" + ") : "—");
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const ALL_STATUSES = [...new Set([...STATUSES.SALES, ...STATUSES.DELIVERY])];

/** Reconciled rows summed by a label and currency: approved revenue, cost, margin; plus what's still open. */
function rollup(rec: RecRow[], label: (g: RecRow) => string) {
  const by = new Map<string, { label: string; currency: string; revenue: number; cost: number; open: number }>();
  for (const g of rec) {
    const k = `${label(g)}|${g.currency}`;
    const r = by.get(k) ?? { label: label(g), currency: g.currency, revenue: 0, cost: 0, open: 0 };
    r.revenue += g.revenue.approved;
    r.cost += g.cost.approved;
    r.open += g.revenue.pending + g.revenue.disputed + g.revenue.draft;
    by.set(k, r);
  }
  return [...by.values()].map((r) => ({ ...r, margin: r.revenue - r.cost, pct: r.revenue ? ((r.revenue - r.cost) / r.revenue) * 100 : null }));
}

export default async function OverviewPage({ searchParams }: PageProps<"/affiliate/overview">) {
  const a = await requireAffiliate();
  if (!(a.admin || a.finance || a.leadership)) redirect("/dashboard");
  const q = await searchParams;
  const { month, year, f, where, filters, period } = await overviewFilter(q);
  // Trend: the 12 months up to the chosen month (or year end, or this month).
  const trendTo = month || (year ? `${year}-12` : (await todayIso()).slice(0, 7));
  const trendFrom = shiftMonth(trendTo, -11);

  const [rows, advertisers, campaigns, publishers, owners, trendRows, openDelivery] = await Promise.all([
    // ponytail: everything for the period in memory; fine for thousands of rows a month, aggregate in SQL beyond that.
    db.validation.findMany({ where, include: { campaign: { include: { advertiser: true } }, publisher: true, createdBy: true }, take: 20000 }),
    db.advertiser.findMany({ orderBy: { name: "asc" } }),
    db.campaign.findMany({ include: { advertiser: true }, orderBy: [{ advertiser: { name: "asc" } }, { name: "asc" }] }),
    db.publisher.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { validations: { some: {} } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.validation.findMany({
      where: { AND: [{ month: { gte: trendFrom, lte: trendTo } }, ...filters] },
      select: { side: true, status: true, campaignId: true, month: true, geo: true, currency: true, publisherId: true, netAmount: true, approvedAmount: true, approvedConversions: true },
      take: 50000,
    }),
    // Unpaid publisher records from any month: money owed doesn't stop being owed when the month ends.
    db.validation.findMany({
      where: { AND: [{ side: "DELIVERY", status: { notIn: ["DRAFT", "PAID", "CLOSED"] } }, ...filters] },
      include: { campaign: { include: { advertiser: true } }, publisher: true, createdBy: true },
      orderBy: [{ month: "asc" }, { number: "asc" }],
      take: 20000,
    }),
  ]);

  const money = rows.map((r) => ({ ...r, netAmount: Number(r.netAmount), approvedAmount: r.approvedAmount == null ? null : Number(r.approvedAmount) }));
  const sales = money.filter((r) => r.side === "SALES");
  const delivery = money.filter((r) => r.side === "DELIVERY");
  const sum = (list: typeof money, keep: (r: (typeof money)[number]) => boolean) => {
    const m: Money = new Map();
    for (const r of list) if (keep(r)) add(m, r.currency, counted(r));
    return m;
  };
  const conv = (list: typeof money) => list.filter((r) => bucket(r.side, r.status) === "approved").reduce((n, r) => n + r.approvedConversions, 0);

  const revenue = sum(sales, (r) => bucket(r.side, r.status) === "approved");
  const cost = sum(delivery, (r) => bucket(r.side, r.status) === "approved");
  const margin: Money = new Map(revenue);
  for (const [c, n] of cost) add(margin, c, -n);
  const marginPct = [...margin].map(([c, n]) => (revenue.get(c) ? `${c} ${pct((n / revenue.get(c)!) * 100)}` : null)).filter(Boolean).join(" · ") || "—";

  const rec = reconcile(money).sort((x, y) => y.month.localeCompare(x.month) || y.margin - x.margin);
  const campaignById = new Map(campaigns.map((c) => [c.id, c]));
  const publisherById = new Map(publishers.map((p) => [p.id, p]));

  // Owed to each publisher: due and not-final from every month; paid within the period.
  const open = openDelivery.map((r) => ({ ...r, netAmount: Number(r.netAmount), approvedAmount: r.approvedAmount == null ? null : Number(r.approvedAmount) }));
  const owed = new Map<number, { due: Money; paid: Money; open: Money }>();
  const owe = (r: (typeof open)[number], m: "due" | "paid" | "open") => {
    if (r.publisherId == null) return;
    const o = owed.get(r.publisherId) ?? { due: new Map(), paid: new Map(), open: new Map() };
    add(o[m], r.currency, counted(r));
    owed.set(r.publisherId, o);
  };
  for (const r of open) owe(r, payment(r.status) === "due" ? "due" : "open");
  for (const r of delivery) if (payment(r.status) === "paid") owe(r, "paid");
  const due = open.filter((r) => payment(r.status) === "due");
  // Publisher validations not approved yet (in review or disputed), oldest first.
  const pendingPub = open.filter((r) => bucket(r.side, r.status) !== "approved");

  // Clients that haven't sent a validation for the month: active campaigns with no submitted Sales record.
  const missing = month
    ? campaigns.filter((c) => c.active && c.advertiser.active
        && (!f.advertiser || c.advertiserId === f.advertiser) && (!f.campaign || c.id === f.campaign)
        && !sales.some((r) => r.campaignId === c.id && r.status !== "DRAFT"))
    : [];

  // Who holds records that aren't approved yet.
  const pendingBy = new Map<string, { name: string; side: string; n: number; disputed: number }>();
  for (const r of money) {
    const b = bucket(r.side, r.status);
    if (b === "approved") continue;
    const key = `${r.createdById}|${r.side}`;
    const p = pendingBy.get(key) ?? { name: r.createdBy.name, side: r.side === "SALES" ? "Sales" : "Delivery", n: 0, disputed: 0 };
    p.n++;
    if (b === "disputed") p.disputed++;
    pendingBy.set(key, p);
  }

  const num = (list: typeof trendRows) => list.map((r) => ({ ...r, netAmount: Number(r.netAmount), approvedAmount: r.approvedAmount == null ? null : Number(r.approvedAmount) }));
  const trend = rollup(reconcile(num(trendRows)), (g) => g.month).sort((x, y) => y.label.localeCompare(x.label) || x.currency.localeCompare(y.currency));
  const byClient = rollup(rec, (g) => campaignById.get(g.campaignId)?.advertiser.name ?? "?").sort((x, y) => y.margin - x.margin);
  const exportQs = new URLSearchParams(Object.entries(q).filter(([, v]) => typeof v === "string" && v) as [string, string][]);

  const st = (list: typeof money, ...s: Status[]) => list.filter((r) => s.includes(r.status));
  const sel = "input h-10";

  return (
    <div className="flex flex-col gap-6">
      <form className="flex flex-wrap items-end gap-2.5">
        <div><label className="label" htmlFor="f-month">Month</label><input className={sel} id="f-month" name="month" type="month" defaultValue={month} /></div>
        <div><label className="label" htmlFor="f-year">or year</label><input className={`${sel} w-24`} id="f-year" name="year" inputMode="numeric" pattern="\d{4}" placeholder="2026" defaultValue={year} /></div>
        <Select id="advertiser" label="Client" value={f.advertiser} options={advertisers.map((x) => [x.id, x.name])} />
        <Select id="campaign" label="Campaign" value={f.campaign} options={campaigns.map((x) => [x.id, `${x.advertiser.name} · ${x.name}`])} />
        <Select id="publisher" label="Publisher" value={f.publisher} options={publishers.map((x) => [x.id, x.name])} />
        <div><label className="label" htmlFor="f-geo">GEO</label><input className={`${sel} w-20`} id="f-geo" name="geo" maxLength={60} defaultValue={f.geo} /></div>
        <Select id="offerModel" label="Offer model" value={f.offerModel} options={OFFER_MODELS.map((x) => [x, x])} />
        <Select id="salesOwner" label="Sales owner" value={f.salesOwner} options={owners.map((x) => [x.id, x.name])} />
        <Select id="deliveryOwner" label="Delivery owner" value={f.deliveryOwner} options={owners.map((x) => [x.id, x.name])} />
        <Select id="status" label="Status" value={f.status} options={ALL_STATUSES.map((x) => [x, STATUS_LABEL[x]])} />
        <Select id="payment" label="Payment" value={f.payment} options={Object.entries(PAYMENT_LABEL)} />
        <button className="btn h-10">Apply</button>
        <Link href="/affiliate/overview?month=all" className="link h-10 content-center text-sm">All time</Link>
        <Link href="/affiliate/overview" className="link h-10 content-center text-sm">Reset</Link>
        <a href={`/affiliate/overview/export?${exportQs}`} className="btn ml-auto h-10">Export report (CSV)</a>
      </form>
      <p className="-mt-3 text-xs text-gray-500">
        Showing <b>{period}</b>. Only approved records count as validated revenue or cost; partial approvals count their approved part. Currencies are never added together.
      </p>

      <Section title="Financial overview">
        <StatCard label="Client validated revenue" value={fmt(revenue)} note={`${sales.filter((r) => bucket(r.side, r.status) === "approved").length} approved client validations`} />
        <StatCard label="Publisher validated cost" value={fmt(cost)} note={`${delivery.filter((r) => bucket(r.side, r.status) === "approved").length} approved publisher validations`} />
        <StatCard label="Gross margin" value={fmt(margin)} note={marginPct} />
        <StatCard label="Revenue pending validation" value={fmt(sum(sales, (r) => bucket(r.side, r.status) !== "approved"))} note="Draft, in review or disputed" />
        <StatCard label="Publisher cost pending approval" value={fmt(sum(delivery, (r) => bucket(r.side, r.status) !== "approved"))} note="Not yet final with the publisher" />
        <StatCard label="Campaigns reconciled" value={rec.length} note={`${rec.filter((g) => g.margin < 0).length} with a negative margin`} warn={rec.some((g) => g.margin < 0)} />
      </Section>

      <Section title="Sales validations">
        <StatCard label="Client validated revenue" value={fmt(revenue)} href="/affiliate/sales?status=APPROVED" />
        <StatCard label="Approved conversions" value={conv(sales).toLocaleString("en-IN")} />
        <StatCard label="Pending client validations" value={sales.filter((r) => ["draft", "pending"].includes(bucket(r.side, r.status))).length} note={`${missing.length} campaigns with nothing received`} />
        <StatCard label="Disputed" value={st(sales, "DISPUTED").length} warn={st(sales, "DISPUTED").length > 0} href="/affiliate/sales?status=DISPUTED" />
        <StatCard label="Awaiting Finance approval" value={fmt(sum(st(sales, "SUBMITTED", "UNDER_REVIEW"), () => true))} note={`${st(sales, "SUBMITTED", "UNDER_REVIEW").length} records`} />
      </Section>

      <Section title="Delivery validations">
        <StatCard label="Publisher payable" value={fmt(cost)} note="Approved publisher cost, paid or not" />
        <StatCard label="Approved publisher conversions" value={conv(delivery).toLocaleString("en-IN")} />
        <StatCard label="Pending to be sent" value={st(delivery, "READY_TO_SEND").length} href="/affiliate/delivery?status=READY_TO_SEND" />
        <StatCard label="Publisher disputes" value={st(delivery, "DISPUTED").length} warn={st(delivery, "DISPUTED").length > 0} href="/affiliate/delivery?status=DISPUTED" />
        <StatCard label="Invoices received" value={delivery.filter((r) => r.invoiceNumber || r.status === "INVOICE_RECEIVED").length} />
        <StatCard label="Payments pending" value={fmt(sum(due, () => true))} note={`${due.length} records, all months`} href="/affiliate/overview?month=all&payment=due" />
        <StatCard label="Pending publisher validations" value={pendingPub.length} note="Not approved yet, all months" warn={pendingPub.some((r) => r.status === "DISPUTED")} />
        <StatCard label="Payments completed" value={fmt(sum(delivery, (r) => payment(r.status) === "paid"))} note={`${delivery.filter((r) => payment(r.status) === "paid").length} records`} />
      </Section>

      <section className="flex flex-col gap-3">
        <h2 className="card-title">Campaign profitability</h2>
        <p className="-mt-2 text-xs text-gray-500">Matched by campaign, month, GEO and currency. Client and publisher conversions can differ; they&apos;re shown side by side. Open a row for its publishers.</p>
        <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
          <table className="table min-w-[1000px]">
            <thead>
              <tr>
                <th>Campaign</th><th>Month</th><th>GEO</th>
                <th className="text-right">Client conv.</th><th className="text-right">Publisher conv.</th>
                <th className="text-right">Validated revenue</th><th className="text-right">Publisher cost</th>
                <th className="text-right">Gross margin</th><th className="text-right">Margin %</th>
                <th className="text-right">Pending rev. / cost</th><th className="text-right">Disputed rev. / cost</th>
              </tr>
            </thead>
            <tbody>
              {rec.map((g) => {
                const c = campaignById.get(g.campaignId);
                const m = (n: number) => (n ? amount(n, g.currency) : "—");
                return (
                  <tr key={`${g.campaignId}|${g.month}|${g.geo}|${g.currency}`} className="align-top">
                    <td>
                      <details>
                        <summary className="cursor-pointer"><span className="font-semibold">{c?.advertiser.name}</span> · {c?.name}</summary>
                        <ul className="mt-1 space-y-0.5 text-xs text-gray-600">
                          {[...g.publishers].map(([pid, p]) => (
                            <li key={pid}>{publisherById.get(pid)?.name}: <span className="font-mono">{m(p.approved)}</span>{p.open ? <> approved, <span className="font-mono">{m(p.open)}</span> in progress</> : " approved"}</li>
                          ))}
                          {!g.publishers.size && <li>No publisher validations.</li>}
                        </ul>
                      </details>
                    </td>
                    <td className="font-mono text-[12.5px]">{g.month}</td>
                    <td className="font-mono text-[12.5px]">{g.geo}</td>
                    <td className="text-right font-mono text-[13px]">{g.clientConv.toLocaleString("en-IN")}</td>
                    <td className="text-right font-mono text-[13px]">{g.publisherConv.toLocaleString("en-IN")}</td>
                    <td className="text-right font-mono text-[13px]">{m(g.revenue.approved)}</td>
                    <td className="text-right font-mono text-[13px]">{m(g.cost.approved)}</td>
                    <td className={`text-right font-mono text-[13px] font-semibold ${g.margin < 0 ? "text-red-700" : ""}`}>{amount(g.margin, g.currency)}</td>
                    <td className="text-right font-mono text-[13px]">{pct(g.marginPct)}</td>
                    <td className="text-right font-mono text-[12px] text-gray-600">{m(g.revenue.pending + g.revenue.draft)} / {m(g.cost.pending + g.cost.draft)}</td>
                    <td className="text-right font-mono text-[12px] text-gray-600">{m(g.revenue.disputed)} / {m(g.cost.disputed)}</td>
                  </tr>
                );
              })}
              {!rec.length && <tr><td colSpan={11} className="py-8 text-center text-sm text-gray-500">No validations for {period}.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <section className="flex flex-col gap-3">
          <h2 className="card-title">Monthly trend</h2>
          <p className="-mt-2 text-xs text-gray-500">{trendFrom} to {trendTo}, with the filters above (except the period). Approved figures only.</p>
          <Rollup rows={trend} first="Month" mono />
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="card-title">By client</h2>
          <p className="-mt-2 text-xs text-gray-500">{period}. Open = client revenue not approved yet.</p>
          <Rollup rows={byClient} first="Client" />
        </section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2 [&>*]:min-w-0">
        <section className="flex flex-col gap-3">
          <h2 className="card-title">What we owe publishers</h2>
          <p className="-mt-2 text-xs text-gray-500">Due and not-final amounts cover every month; Paid covers {period}.</p>
          <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
            <table className="table">
              <thead><tr><th>Publisher</th><th className="text-right">Due (approved, unpaid)</th><th className="text-right">Paid</th><th className="text-right">Not final yet</th></tr></thead>
              <tbody>
                {[...owed].sort(([x], [y]) => (publisherById.get(x)?.name ?? "").localeCompare(publisherById.get(y)?.name ?? "")).map(([pid, o]) => (
                  <tr key={pid}>
                    <td>{publisherById.get(pid)?.name}</td>
                    <td className="text-right font-mono text-[13px] font-semibold">{fmt(o.due)}</td>
                    <td className="text-right font-mono text-[13px]">{fmt(o.paid)}</td>
                    <td className="text-right font-mono text-[13px] text-gray-600">{fmt(o.open)}</td>
                  </tr>
                ))}
                {!owed.size && <tr><td colSpan={4} className="py-6 text-center text-sm text-gray-500">No publisher validations.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-6">
          <section className="card space-y-2">
            <h2 className="card-title">Pending publisher validations</h2>
            <p className="text-xs text-gray-500">Not approved yet, from any month, oldest first.</p>
            {pendingPub.length ? (
              <div className="overflow-x-auto">
                <table className="table">
                  <thead><tr><th>Record</th><th>Publisher</th><th>Campaign</th><th>Month</th><th>Status</th><th className="text-right">Net</th><th>Owner</th></tr></thead>
                  <tbody>
                    {pendingPub.slice(0, 50).map((r) => (
                      <tr key={r.id}>
                        <td><Link className="link font-mono text-[13px]" href={`/affiliate/delivery/${r.id}`}>{r.number}</Link></td>
                        <td>{r.publisher?.name}</td>
                        <td>{r.campaign.advertiser.name} · {r.campaign.name}</td>
                        <td className="font-mono text-[12.5px]">{r.month}</td>
                        <td className={r.status === "DISPUTED" ? "font-semibold text-red-700" : ""}>{STATUS_LABEL[r.status]}</td>
                        <td className="text-right font-mono text-[13px]">{amount(r.netAmount, r.currency)}</td>
                        <td>{r.createdBy.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pendingPub.length > 50 && <p className="pt-2 text-xs text-gray-500">Showing the oldest 50 of {pendingPub.length}. <Link className="link" href="/affiliate/delivery">See all Delivery validations</Link></p>}
              </div>
            ) : <p className="text-sm text-gray-500">None. Every publisher validation is approved, paid or a draft.</p>}
          </section>
          <section className="card space-y-2">
            <h2 className="card-title">Clients without a validation{month ? ` for ${month}` : ""}</h2>
            {!month ? <p className="text-sm text-gray-500">Pick a month to see this.</p>
              : missing.length ? (
                <ul className="space-y-1 text-sm">{missing.map((c) => <li key={c.id}><span className="font-semibold">{c.advertiser.name}</span> · {c.name}</li>)}</ul>
              ) : <p className="text-sm text-gray-500">Every active campaign has a client validation.</p>}
          </section>
          <section className="card space-y-2">
            <h2 className="card-title">Who has validations still open</h2>
            {pendingBy.size ? (
              <table className="table">
                <thead><tr><th>Employee</th><th>Side</th><th className="text-right">Not approved</th><th className="text-right">Disputed</th></tr></thead>
                <tbody>
                  {[...pendingBy.values()].sort((x, y) => y.n - x.n).map((p) => (
                    <tr key={`${p.name}|${p.side}`}><td>{p.name}</td><td>{p.side}</td><td className="text-right font-mono">{p.n}</td><td className="text-right font-mono">{p.disputed || "—"}</td></tr>
                  ))}
                </tbody>
              </table>
            ) : <p className="text-sm text-gray-500">Nothing open.</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

function Rollup({ rows, first, mono }: { rows: ReturnType<typeof rollup>; first: string; mono?: boolean }) {
  const m = (n: number, c: string) => (n ? amount(n, c) : "—");
  return (
    <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
      <table className="table">
        <thead><tr><th>{first}</th><th className="text-right">Revenue</th><th className="text-right">Publisher cost</th><th className="text-right">Margin</th><th className="text-right">%</th><th className="text-right">Open</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.label}|${r.currency}`}>
              <td className={mono ? "font-mono text-[12.5px]" : ""}>{r.label}</td>
              <td className="text-right font-mono text-[13px]">{m(r.revenue, r.currency)}</td>
              <td className="text-right font-mono text-[13px]">{m(r.cost, r.currency)}</td>
              <td className={`text-right font-mono text-[13px] font-semibold ${r.margin < 0 ? "text-red-700" : ""}`}>{amount(r.margin, r.currency)}</td>
              <td className="text-right font-mono text-[13px]">{pct(r.pct)}</td>
              <td className="text-right font-mono text-[12px] text-gray-600">{m(r.open, r.currency)}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-sm text-gray-500">Nothing yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="card-title">{title}</h2>
      <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">{children}</div>
    </section>
  );
}

function Select({ id, label, value, options }: { id: string; label: string; value: string | number | undefined; options: [string | number, string][] }) {
  return (
    <div>
      <label className="label" htmlFor={`f-${id}`}>{label}</label>
      <select className="input h-10 max-w-[200px]" id={`f-${id}`} name={id} defaultValue={value ?? ""}>
        <option value="">All</option>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export const metadata = { title: "Affiliate overview" };

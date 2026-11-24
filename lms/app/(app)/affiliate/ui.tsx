import type { Advertiser, Campaign, Publisher, Validation } from "@prisma/client";
import { toIso } from "@/lib/leave-days";
import { CURRENCIES, FILE_ACCEPT, OFFER_MODELS, PLATFORMS, STATUS_LABEL, type Side, type Status } from "@/lib/affiliate-rules";
import type { FormState } from "../admin/actions";
import { ActionForm } from "../action-form";

const TONE: Partial<Record<Status, string>> = {
  DRAFT: "border border-gray-300 text-char",
  DISPUTED: "bg-red-50 text-red-800",
  APPROVED: "bg-char text-paper",
  PARTIALLY_APPROVED: "bg-char text-paper",
  ACKNOWLEDGED: "bg-char text-paper",
  PAID: "bg-char text-paper",
  CLOSED: "bg-gray-100 text-gray-600",
};
export function ValidationStatus({ s }: { s: Status }) {
  return <span className={`pill whitespace-nowrap ${TONE[s] ?? "bg-brand-50 text-brand-700"}`}>{STATUS_LABEL[s]}</span>;
}

export const amount = (n: number | { toString(): string }, currency: string) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(n));

/** "$5,000 + €200": totals per currency, never added across currencies. */
export function totals(rows: { netAmount: { toString(): string }; currency: string }[]) {
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.currency, (by.get(r.currency) ?? 0) + Number(r.netAmount));
  return by.size ? [...by].map(([c, n]) => amount(n, c)).join(" + ") : "—";
}

type CampaignOption = Campaign & { advertiser: Advertiser };

export function ValidationForm({ side, action, campaigns, publishers, v, month, revision }: {
  side: Side;
  action: (s: FormState, f: FormData) => Promise<FormState>;
  campaigns: CampaignOption[];
  publishers: Publisher[];
  v?: Validation;
  month: string;
  /** Set when saving counts as a revision of an approved record: what happens after. */
  revision?: string;
}) {
  const delivery = side === "DELIVERY";
  // Group campaigns by advertiser so "client, then campaign" is one pick.
  const groups = new Map<string, CampaignOption[]>();
  for (const c of campaigns) groups.set(c.advertiser.name, [...(groups.get(c.advertiser.name) ?? []), c]);
  const num = (x: { toString(): string } | null | undefined) => (x == null ? "" : Number(x));

  return (
    <ActionForm action={action} submit={revision ? "Save revision" : v ? "Save changes" : "Save as draft"} submitClass="btn btn-accent">
      {revision && (
        <div className="rounded-[10px] border border-brand-200 bg-brand-50 p-3">
          <label className="label" htmlFor="reason">Reason for revision (required)</label>
          <textarea className="input" id="reason" name="reason" rows={2} maxLength={2000} required />
          <p className="mt-1 text-xs text-gray-600">{revision} The old and new figures are kept in the history.</p>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="campaignId">Client and campaign</label>
          <select className="input" id="campaignId" name="campaignId" required defaultValue={v?.campaignId ?? ""}>
            <option value="" disabled>Choose a campaign…</option>
            {[...groups].map(([adv, cs]) => (
              <optgroup key={adv} label={adv}>
                {cs.map((c) => <option key={c.id} value={c.id}>{c.name}{c.geo ? ` · ${c.geo}` : ""}{c.offerModel ? ` · ${c.offerModel}` : ""}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {delivery ? (
          <div>
            <label className="label" htmlFor="publisherId">Publisher</label>
            <select className="input" id="publisherId" name="publisherId" required defaultValue={v?.publisherId ?? ""}>
              <option value="" disabled>Choose a publisher…</option>
              {publishers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</option>)}
            </select>
          </div>
        ) : (
          <div><label className="label" htmlFor="clientRef">Client campaign ID (optional)</label><input className="input font-mono" id="clientRef" name="clientRef" maxLength={100} defaultValue={v?.clientRef ?? ""} /></div>
        )}
        <div><label className="label" htmlFor="month">Validation month</label><input className="input" id="month" name="month" type="month" required max={month} defaultValue={v?.month ?? month} /></div>
        <div><label className="label" htmlFor="geo">GEO</label><input className="input" id="geo" name="geo" maxLength={60} defaultValue={v?.geo ?? ""} placeholder="Blank = campaign's" /></div>
        <div>
          <label className="label" htmlFor="platform">Platform</label>
          <select className="input" id="platform" name="platform" defaultValue={v?.platform ?? ""}><option value="">Campaign&apos;s / mixed</option>{PLATFORMS.map(([val, l]) => <option key={val} value={val}>{l}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="offerModel">Offer model</label>
          <select className="input" id="offerModel" name="offerModel" defaultValue={v?.offerModel ?? ""}><option value="">Campaign&apos;s</option>{OFFER_MODELS.map((x) => <option key={x}>{x}</option>)}</select>
        </div>
        <div>
          <label className="label" htmlFor="currency">Currency</label>
          <select className="input" id="currency" name="currency" defaultValue={v?.currency ?? "USD"}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select>
        </div>
      </div>

      <fieldset className="grid gap-3 border-t border-[#f0ece6] pt-3 sm:grid-cols-3">
        <legend className="eyebrow pb-1">Conversions</legend>
        <div><label className="label" htmlFor="totalConversions">{delivery ? "Delivered" : "Total submitted"}</label><input className="input" id="totalConversions" name="totalConversions" type="number" min={0} step={1} required defaultValue={v?.totalConversions ?? ""} /></div>
        <div><label className="label" htmlFor="approvedConversions">Approved</label><input className="input" id="approvedConversions" name="approvedConversions" type="number" min={0} step={1} required defaultValue={v?.approvedConversions ?? ""} /></div>
        <div><label className="label" htmlFor="rejectedConversions">Rejected</label><input className="input" id="rejectedConversions" name="rejectedConversions" type="number" min={0} step={1} defaultValue={v?.rejectedConversions ?? ""} placeholder="Blank = total − approved" /></div>
      </fieldset>

      <fieldset className="grid gap-3 border-t border-[#f0ece6] pt-3 sm:grid-cols-3">
        <legend className="eyebrow pb-1">Amounts</legend>
        {delivery && <div><label className="label" htmlFor="payoutRate">Payout rate (per conversion)</label><input className="input" id="payoutRate" name="payoutRate" type="number" min={0} step="0.0001" defaultValue={num(v?.payoutRate)} /></div>}
        <div>
          <label className="label" htmlFor="amount">{delivery ? "Gross amount" : "Approved amount"}</label>
          <input className="input" id="amount" name="amount" type="number" min={0} step="0.01" required={!delivery} defaultValue={num(v?.amount)} placeholder={delivery ? "Only if there's no rate" : undefined} />
        </div>
        <div><label className="label" htmlFor="deduction">Deduction / adjustment</label><input className="input" id="deduction" name="deduction" type="number" min={0} step="0.01" defaultValue={num(v?.deduction) || ""} placeholder="0" /></div>
        <p className="text-xs text-gray-500 sm:col-span-3">
          {delivery ? "With a payout rate, gross = approved conversions × rate. Net invoice amount = gross − deduction." : "Net validated revenue = approved amount − deduction."} Worked out when you save.
        </p>
      </fieldset>

      {delivery && (
        <fieldset className="grid gap-3 border-t border-[#f0ece6] pt-3 sm:grid-cols-2">
          <legend className="eyebrow pb-1">Publisher invoice (if any)</legend>
          <div><label className="label" htmlFor="invoiceNumber">Invoice number</label><input className="input font-mono" id="invoiceNumber" name="invoiceNumber" maxLength={60} defaultValue={v?.invoiceNumber ?? ""} /></div>
          <div><label className="label" htmlFor="invoiceDate">Invoice date</label><input className="input" id="invoiceDate" name="invoiceDate" type="date" defaultValue={v?.invoiceDate ? toIso(v.invoiceDate) : ""} /></div>
        </fieldset>
      )}

      <div className="grid gap-3 border-t border-[#f0ece6] pt-3">
        <div><label className="label" htmlFor="file">{delivery ? "Validation report / invoice" : "Client validation report"} (Excel, CSV or PDF, up to 10 MB{v ? "; adds to the files already attached" : ""})</label><input className="input" id="file" name="file" type="file" accept={FILE_ACCEPT} /></div>
        <div><label className="label" htmlFor="remarks">Remarks (optional)</label><textarea className="input" id="remarks" name="remarks" rows={3} maxLength={2000} defaultValue={v?.remarks ?? ""} /></div>
      </div>
    </ActionForm>
  );
}

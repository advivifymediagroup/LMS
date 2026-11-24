import { db } from "@/lib/db";
import { canManageDirectory, requireAffiliate } from "@/lib/affiliate";
import { OFFER_MODELS, PLATFORMS } from "@/lib/affiliate-rules";
import { ActionForm } from "../../action-form";
import { SubmitButton } from "../../../submit-button";
import { addAdvertiser, addCampaign, addPublisher, toggleActive } from "../actions";

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS) as Record<string, string>;

function Toggle({ kind, id, active, can }: { kind: "advertiser" | "campaign" | "publisher"; id: number; active: boolean; can: boolean }) {
  if (!can) return active ? null : <span className="pill bg-gray-100 text-gray-600">Hidden</span>;
  return (
    <form action={toggleActive.bind(null, kind, id)}>
      <SubmitButton className="btn btn-sm" pendingText="…">{active ? "Hide" : "Show again"}</SubmitButton>
    </form>
  );
}

export default async function DirectoryPage() {
  const a = await requireAffiliate();
  const can = canManageDirectory(a);
  const [advertisers, publishers] = await Promise.all([
    db.advertiser.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], include: { campaigns: { orderBy: [{ active: "desc" }, { name: "asc" }] } } }),
    db.publisher.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
  ]);
  const activeAdvertisers = advertisers.filter((x) => x.active);

  return (
    <div className="flex flex-col gap-6">
      <p className="max-w-3xl text-sm text-gray-600">
        The advertisers, campaigns and publishers that Sales and Delivery validations are picked from. Hiding an entry removes it from the pick lists; past validations keep it.
      </p>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="flex min-w-0 flex-col gap-3">
          <h2 className="card-title">Advertisers and campaigns</h2>
          {can && (
            <div className="grid gap-3 lg:grid-cols-2">
              <ActionForm action={addAdvertiser} submit="Add advertiser" className="card space-y-3" submitClass="btn btn-sm btn-primary">
                <div><label className="label" htmlFor="adv-name">New advertiser / client</label><input className="input" id="adv-name" name="name" required maxLength={150} placeholder="e.g. Saily" /></div>
              </ActionForm>
              <ActionForm action={addCampaign} submit="Add campaign" className="card space-y-3" submitClass="btn btn-sm btn-primary">
                <div className="grid gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="c-adv">Advertiser</label>
                    <select className="input" id="c-adv" name="advertiserId" required defaultValue="">
                      <option value="" disabled>Choose…</option>
                      {activeAdvertisers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                  </div>
                  <div><label className="label" htmlFor="c-name">Campaign name</label><input className="input" id="c-name" name="name" required maxLength={150} placeholder="Saily US – eSIM Installs" /></div>
                  <div><label className="label" htmlFor="c-geo">GEO</label><input className="input" id="c-geo" name="geo" maxLength={60} placeholder="US" /></div>
                  <div>
                    <label className="label" htmlFor="c-platform">Platform</label>
                    <select className="input" id="c-platform" name="platform" defaultValue=""><option value="">Any / mixed</option>{PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </div>
                  <div>
                    <label className="label" htmlFor="c-model">Offer model</label>
                    <select className="input" id="c-model" name="offerModel" defaultValue=""><option value="">Not set</option>{OFFER_MODELS.map((v) => <option key={v}>{v}</option>)}</select>
                  </div>
                </div>
              </ActionForm>
            </div>
          )}
          <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
            <table className="table min-w-[620px]">
              <thead><tr><th>Advertiser / campaign</th><th>GEO</th><th>Platform</th><th>Model</th><th /></tr></thead>
              <tbody>
                {advertisers.map((adv) => [
                  <tr key={`a${adv.id}`} className={`bg-[#fcfbf9] ${adv.active ? "" : "opacity-60"}`}>
                    <td colSpan={4} className="font-bold">{adv.name} <span className="text-xs font-normal text-gray-500">· {adv.campaigns.length} campaign(s)</span></td>
                    <td className="text-right"><Toggle kind="advertiser" id={adv.id} active={adv.active} can={can} /></td>
                  </tr>,
                  ...adv.campaigns.map((c) => (
                    <tr key={`c${c.id}`} className={c.active ? "" : "opacity-60"}>
                      <td className="pl-8">{c.name}</td>
                      <td className="font-mono text-[12.5px]">{c.geo ?? "—"}</td>
                      <td>{c.platform ? PLATFORM_LABEL[c.platform] : "—"}</td>
                      <td className="font-mono text-[12.5px]">{c.offerModel ?? "—"}</td>
                      <td className="text-right"><Toggle kind="campaign" id={c.id} active={c.active} can={can} /></td>
                    </tr>
                  )),
                ])}
                {!advertisers.length && <tr><td colSpan={5} className="py-8 text-center text-sm text-gray-500">No advertisers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="card-title">Publishers</h2>
          {can && (
            <ActionForm action={addPublisher} submit="Add publisher" className="card space-y-3" submitClass="btn btn-sm btn-primary">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div><label className="label" htmlFor="p-name">Publisher name</label><input className="input" id="p-name" name="name" required maxLength={150} /></div>
                <div><label className="label" htmlFor="p-code">Publisher ID</label><input className="input font-mono" id="p-code" name="code" maxLength={40} placeholder="Internal ref" /></div>
              </div>
            </ActionForm>
          )}
          <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
            <table className="table">
              <thead><tr><th>Publisher</th><th>ID</th><th /></tr></thead>
              <tbody>
                {publishers.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-60"}>
                    <td className="font-semibold">{p.name}</td>
                    <td className="font-mono text-[12.5px]">{p.code ?? "—"}</td>
                    <td className="text-right"><Toggle kind="publisher" id={p.id} active={p.active} can={can} /></td>
                  </tr>
                ))}
                {!publishers.length && <tr><td colSpan={3} className="py-8 text-center text-sm text-gray-500">No publishers yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

export const metadata = { title: "Clients & publishers" };

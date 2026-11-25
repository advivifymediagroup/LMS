import Link from "next/link";
import { db } from "@/lib/db";
import { ACTIVITY_ACTIONS, activityQuery, requireAffiliate } from "@/lib/affiliate";
import { describe, SIDES } from "@/lib/affiliate-rules";


const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
const LIMIT = 300;

export default async function ActivityPage({ searchParams }: PageProps<"/affiliate/activity">) {
  const a = await requireAffiliate();
  const q = await searchParams;
  const r = await activityQuery(a, q, LIMIT);
  const people = await db.user.findMany({ where: { auditActions: { some: { entityType: "VALIDATION" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => typeof v === "string" && v) as [string, string][]);
  const sel = "input h-10";

  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-end gap-2.5">
        {r.sides.length > 1 && (
          <div><label className="label" htmlFor="f-side">Side</label>
            <select className={sel} id="f-side" name="side" defaultValue={r.side}><option value="">Both</option>{r.sides.map((s) => <option key={s} value={s}>{SIDES[s].label}</option>)}</select></div>
        )}
        <div><label className="label" htmlFor="f-action">What</label>
          <select className={sel} id="f-action" name="action" defaultValue={r.action}><option value="">Everything</option>{ACTIVITY_ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div><label className="label" htmlFor="f-actor">Who</label>
          <select className={`${sel} max-w-[200px]`} id="f-actor" name="actor" defaultValue={r.actor ?? ""}><option value="">Anyone</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
        <div><label className="label" htmlFor="f-from">From</label><input className={sel} id="f-from" name="from" type="date" defaultValue={r.from} /></div>
        <div><label className="label" htmlFor="f-to">To</label><input className={sel} id="f-to" name="to" type="date" defaultValue={r.to} /></div>
        <div><label className="label" htmlFor="f-q">Record or upload ID</label><input className={`${sel} w-44`} id="f-q" name="q" defaultValue={r.search} placeholder="SV-2026-0001" /></div>
        <button className="btn h-10">Filter</button>
        {qs.size > 0 && <Link href="/affiliate/activity" className="link h-10 content-center text-sm">Clear</Link>}
        <a href={`/affiliate/activity/export?${qs}`} className="btn ml-auto h-10">Export CSV</a>
      </form>
      <p className="-mt-1 text-xs text-gray-500">Every change to a validation: who did it and when, old and new figures, status changes, notes, dispute reasons and files. {r.entries.length === LIMIT ? `Showing the latest ${LIMIT}; narrow the filters or export for more.` : ""}</p>

      <div className="overflow-x-auto rounded-[14px] border border-gray-200 bg-white">
        <table className="table min-w-[900px]">
          <thead><tr><th>When</th><th>Who</th><th>Record</th><th>What happened</th></tr></thead>
          <tbody>
            {r.entries.map((e) => {
              const d = describe(e);
              const v = e.record;
              return (
                <tr key={e.id} className="align-top">
                  <td className="text-[12.5px] whitespace-nowrap text-gray-600">{when(e.createdAt)}</td>
                  <td className="text-[13px]">{e.actor?.name ?? "System"}</td>
                  <td>
                    {v ? <Link className="link font-mono text-[13px]" href={`/affiliate/${SIDES[v.side].slug}/${v.id}`}>{v.number}</Link> : <span className="text-gray-500">deleted</span>}
                    {v && <div className="text-xs text-gray-500">{[v.campaign.advertiser.name, v.campaign.name, v.publisher?.name].filter(Boolean).join(" · ")}</div>}
                  </td>
                  <td className="text-[13px]">
                    <div className="font-semibold">{d.title}</div>
                    {d.changes.map((c) => <div key={c} className="font-mono text-[12px] text-gray-600">{c}</div>)}
                    {d.file && <div className="text-xs text-gray-600">File: {d.file}</div>}
                    {d.note && <div className="mt-1 rounded-md bg-[#fcfbf9] px-2 py-1 whitespace-pre-wrap">{d.note}</div>}
                  </td>
                </tr>
              );
            })}
            {!r.entries.length && <tr><td colSpan={4} className="py-8 text-center text-sm text-gray-500">No activity{qs.size ? " matches" : " yet"}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const metadata = { title: "Affiliate activity" };

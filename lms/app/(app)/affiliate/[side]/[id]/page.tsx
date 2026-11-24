import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { actorFor, getValidation, requireAffiliate } from "@/lib/affiliate";
import { allowedMoves, canEditRecord, FILE_ACCEPT, NEEDS_NOTE, PLATFORMS, SIDES, STATUS_LABEL, sideFromSlug, type Status } from "@/lib/affiliate-rules";
import { todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { ActionForm } from "../../../action-form";
import { addFile, moveValidation, saveValidation } from "../../actions";
import { MoveForm } from "../../move-form";
import { amount, ValidationForm, ValidationStatus } from "../../ui";

const PLATFORM_LABEL = Object.fromEntries(PLATFORMS) as Record<string, string>;
const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);

// Figures worth showing in the history when they change.
const TRACKED: [string, string][] = [
  ["totalConversions", "Total conv."], ["approvedConversions", "Approved conv."], ["rejectedConversions", "Rejected conv."],
  ["payoutRate", "Payout rate"], ["amount", "Amount"], ["deduction", "Deduction"], ["netAmount", "Net"], ["currency", "Currency"],
  ["month", "Month"], ["geo", "GEO"], ["invoiceNumber", "Invoice no."],
];

export default async function ValidationPage({ params }: PageProps<"/affiliate/[side]/[id]">) {
  const { side: slug, id } = await params;
  const side = sideFromSlug(slug);
  if (!side) notFound();
  const a = await requireAffiliate(side);
  const v = await getValidation(a, Number(id));
  if (v.side !== side) notFound();
  const meta = SIDES[side];
  const base = `/affiliate/${meta.slug}`;
  const actor = actorFor(a, side);
  const moves = allowedMoves(side, v.status, actor);
  const editable = canEditRecord(side, v.status, actor);
  const canUpload = actor.admin || actor.team || actor.finance;
  const delivery = side === "DELIVERY";

  const [history, campaigns, publishers, today] = await Promise.all([
    db.auditLog.findMany({ where: { entityType: "VALIDATION", entityId: String(v.id) }, include: { actor: true }, orderBy: { createdAt: "desc" } }),
    editable ? db.campaign.findMany({ where: { OR: [{ active: true, advertiser: { active: true } }, { id: v.campaignId }] }, include: { advertiser: true }, orderBy: [{ advertiser: { name: "asc" } }, { name: "asc" }] }) : [],
    editable && delivery ? db.publisher.findMany({ where: { OR: [{ active: true }, { id: v.publisherId ?? -1 }] }, orderBy: { name: "asc" } }) : [],
    todayIso(),
  ]);

  const facts: [string, React.ReactNode][] = [
    ["Month", <span key="m" className="font-mono">{v.month}</span>],
    ["GEO", v.geo],
    ["Platform", v.platform ? PLATFORM_LABEL[v.platform] : "Mixed"],
    ["Offer model", v.offerModel],
    ...(delivery
      ? ([["Publisher ID", <span key="p" className="font-mono">{v.publisher?.code ?? "—"}</span>], ["Sent to publisher", v.sentDate ? toIso(v.sentDate) : "—"]] as [string, React.ReactNode][])
      : ([["Client campaign ID", <span key="c" className="font-mono">{v.clientRef ?? "—"}</span>]] as [string, React.ReactNode][])),
    ["Uploaded by", v.createdBy.name],
    ["Created", when(v.createdAt)],
  ];
  const figures: [string, string][] = [
    [delivery ? "Delivered" : "Total submitted", v.totalConversions.toLocaleString("en-IN")],
    ["Approved", v.approvedConversions.toLocaleString("en-IN")],
    ["Rejected", v.rejectedConversions.toLocaleString("en-IN")],
    ...(delivery && v.payoutRate != null ? ([["Payout rate", amount(v.payoutRate, v.currency)]] as [string, string][]) : []),
    [delivery ? "Gross amount" : "Approved amount", amount(v.amount, v.currency)],
    ["Deduction", amount(v.deduction, v.currency)],
  ];

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Link href={base} className="link text-sm">← {meta.label} validations</Link>
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center gap-2"><span className="eyebrow font-mono">{v.number}</span><ValidationStatus s={v.status} /></div>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">{v.campaign.advertiser.name} · {v.campaign.name}</h1>
            {delivery && <p className="text-sm text-gray-600">Publisher: <span className="font-semibold text-ink">{v.publisher?.name}</span></p>}
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {facts.map(([k, val]) => <div key={k}><dt className="eyebrow">{k}</dt><dd>{val}</dd></div>)}
          </dl>
          <dl className="grid grid-cols-2 gap-3 border-t border-[#f0ece6] pt-3 text-sm sm:grid-cols-3">
            {figures.map(([k, val]) => <div key={k}><dt className="eyebrow">{k}</dt><dd className="font-mono">{val}</dd></div>)}
            <div><dt className="eyebrow">{delivery ? "Net invoice amount" : "Net validated revenue"}</dt><dd className="font-mono text-[17px] font-extrabold">{amount(v.netAmount, v.currency)}</dd></div>
          </dl>
          {delivery && (v.invoiceNumber || v.invoiceDate) && (
            <p className="text-sm">Invoice <span className="font-mono">{v.invoiceNumber ?? "—"}</span>{v.invoiceDate && <> dated <span className="font-mono">{toIso(v.invoiceDate)}</span></>}</p>
          )}
          {v.remarks && <p className="rounded-[10px] bg-[#fcfbf9] p-3 text-sm whitespace-pre-wrap">{v.remarks}</p>}
        </div>

        {moves.length > 0 && (
          <section className="card space-y-2">
            <h2 className="card-title">Next step</h2>
            <MoveForm action={moveValidation.bind(null, v.id)} moves={moves.map(({ to, label }) => ({ to, label }))}
              notesFor={NEEDS_NOTE.filter((s) => moves.some((mv) => mv.to === s)).map((s) => STATUS_LABEL[s].toLowerCase())} />
          </section>
        )}

        {editable ? (
          <>
            <h2 className="card-title">Edit figures</h2>
            {a.admin && !actor.team && <p className="text-sm text-gray-600">You&apos;re editing as admin. Every change is recorded in the history.</p>}
            <ValidationForm side={side} action={saveValidation.bind(null, side, v.id)} campaigns={campaigns} publishers={publishers} v={v} month={today.slice(0, 7)} />
          </>
        ) : actor.team && (
          <p className="text-sm text-gray-600">Figures are locked while the record is {STATUS_LABEL[v.status].toLowerCase()}.</p>
        )}
      </div>

      <aside className="flex flex-col gap-4">
        <section className="card space-y-3">
          <h2 className="card-title">Files</h2>
          {v.files.length ? (
            <ul className="space-y-2">
              {v.files.map((f) => (
                <li key={f.id} className="border-t border-[#f0ece6] pt-2 first:border-0 first:pt-0">
                  <a className="link text-[13.5px] font-semibold break-all" href={`/affiliate/files/${f.id}`} target={f.contentType === "application/pdf" ? "_blank" : undefined} rel="noreferrer">{f.fileName}</a>
                  <div className="text-xs text-gray-500">{kb(f.size)} · {f.uploadedBy.name} · {when(f.createdAt)}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-gray-500">No files attached.</p>}
          {canUpload && (
            <ActionForm action={addFile.bind(null, v.id)} submit="Upload" className="space-y-2 border-t border-[#f0ece6] pt-3" submitClass="btn btn-sm">
              <input className="input" name="file" type="file" accept={FILE_ACCEPT} required aria-label="File to attach" />
            </ActionForm>
          )}
        </section>

        <section className="card space-y-3">
          <h2 className="card-title">History</h2>
          <ol className="space-y-2.5">
            {history.map((h) => {
              const before = (h.before ?? {}) as Record<string, unknown>;
              const after = (h.after ?? {}) as Record<string, unknown>;
              const meta = (h.metadata ?? {}) as { note?: string; file?: string };
              const changes = h.action === "UPDATE" ? TRACKED.filter(([k]) => String(before[k] ?? "") !== String(after[k] ?? "")) : [];
              const title = h.action === "CREATE" ? "Created"
                : h.action === "STATUS" ? `${STATUS_LABEL[before.status as Status] ?? before.status} → ${STATUS_LABEL[after.status as Status] ?? after.status}`
                : h.action === "UPLOAD" ? "Uploaded a file" : "Edited";
              return (
                <li key={h.id} className="border-t border-[#f0ece6] pt-2 text-[13px] first:border-0 first:pt-0">
                  <div className="font-semibold">{title}</div>
                  {changes.map(([k, label]) => <div key={k} className="font-mono text-[12px] text-gray-600">{label}: {String(before[k] ?? "—")} → {String(after[k] ?? "—")}</div>)}
                  {meta.file && <div className="text-xs text-gray-600">File: {meta.file}</div>}
                  {meta.note && <div className="mt-1 rounded-md bg-[#fcfbf9] px-2 py-1 whitespace-pre-wrap">{meta.note}</div>}
                  <div className="text-xs text-gray-500">{h.actor?.name ?? "System"} · {when(h.createdAt)}</div>
                </li>
              );
            })}
          </ol>
        </section>
      </aside>
    </div>
  );
}

export const metadata = { title: "Validation" };

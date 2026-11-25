import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actorFor, requireAffiliate } from "@/lib/affiliate";
import { IMPORT_COLUMNS, MAX_IMPORT_ROWS, SIDES, sideFromSlug } from "@/lib/affiliate-rules";
import { importValidations } from "../../actions";
import { ImportForm } from "../../import-form";

export default async function ImportPage({ params }: PageProps<"/affiliate/[side]/import">) {
  const side = sideFromSlug((await params).side);
  if (!side) notFound();
  const a = await requireAffiliate(side);
  const base = `/affiliate/${SIDES[side].slug}`;
  if (!(actorFor(a, side).team || a.admin)) redirect(base);
  const cols = IMPORT_COLUMNS[side];

  return (
    <div className="max-w-5xl space-y-4">
      <Link href={base} className="link text-sm">← {SIDES[side].label} validations</Link>
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">Bulk upload {SIDES[side].label.toLowerCase()} validations</h1>
      <ol className="card list-decimal space-y-1.5 pl-9 text-sm">
        <li><a className="link font-semibold" href={`${base}/template`}>Download the {SIDES[side].label} template</a> and open it in Excel or Google Sheets.</li>
        <li>Replace the example row with one row per {side === "DELIVERY" ? "campaign and publisher" : "campaign"}, up to {MAX_IMPORT_ROWS} rows. Keep the first row as it is.</li>
        <li>Save it as <b>CSV</b> (Excel: File → Save As → CSV UTF-8) and upload it below. You&apos;ll see a preview with any problems before anything is saved.</li>
      </ol>
      <details className="text-sm">
        <summary className="cursor-pointer text-gray-600">What goes in each column</summary>
        <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2">
          {cols.map((c) => <li key={c.field}><b>{c.header}</b>{c.required ? " (required)" : ""}</li>)}
        </ul>
        <p className="mt-2 text-xs text-gray-500">
          Client, campaign{side === "DELIVERY" ? " and publisher (name or publisher ID)" : ""} must match Clients &amp; publishers exactly.
          Blank GEO, platform or offer model take the campaign&apos;s. Month can be 2026-11 or Nov-26; dates are day first (05/11/2026).
          {side === "DELIVERY" && " With a payout rate, gross = approved conversions × rate; otherwise fill in the gross amount."}
        </p>
      </details>
      <ImportForm action={importValidations.bind(null, side)} base={base} />
    </div>
  );
}

export const metadata = { title: "Bulk upload" };

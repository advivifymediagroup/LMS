import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { actorFor, requireAffiliate } from "@/lib/affiliate";
import { SIDES, sideFromSlug } from "@/lib/affiliate-rules";
import { todayIso } from "@/lib/leave";
import { saveValidation } from "../../actions";
import { ValidationForm } from "../../ui";

export default async function NewValidationPage({ params }: PageProps<"/affiliate/[side]/new">) {
  const side = sideFromSlug((await params).side);
  if (!side) notFound();
  const a = await requireAffiliate(side);
  const base = `/affiliate/${SIDES[side].slug}`;
  if (!(actorFor(a, side).team || a.admin)) redirect(base);
  const [campaigns, publishers, today] = await Promise.all([
    db.campaign.findMany({ where: { active: true, advertiser: { active: true } }, include: { advertiser: true }, orderBy: [{ advertiser: { name: "asc" } }, { name: "asc" }] }),
    db.publisher.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    todayIso(),
  ]);

  return (
    <div className="max-w-3xl space-y-4">
      <Link href={base} className="link text-sm">← {SIDES[side].label} validations</Link>
      <h1 className="text-[22px] font-extrabold tracking-[-0.02em]">New {SIDES[side].label.toLowerCase()} validation</h1>
      {!campaigns.length || (side === "DELIVERY" && !publishers.length) ? (
        <p className="card text-sm">
          Add {campaigns.length ? "a publisher" : "the client and campaign"} first in <Link className="link" href="/affiliate/directory">Clients &amp; publishers</Link>.
        </p>
      ) : (
        <>
          <p className="text-sm text-gray-600">
            Missing a {side === "DELIVERY" ? "campaign or publisher" : "client or campaign"}? Add it in <Link className="link" href="/affiliate/directory">Clients &amp; publishers</Link>. The record is saved as a draft; submit it from the next page.
          </p>
          <ValidationForm side={side} action={saveValidation.bind(null, side, null)} campaigns={campaigns} publishers={publishers} month={today.slice(0, 7)} />
        </>
      )}
    </div>
  );
}

export const metadata = { title: "New validation" };

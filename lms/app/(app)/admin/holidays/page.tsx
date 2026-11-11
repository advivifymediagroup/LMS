import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fromIso, todayIso } from "@/lib/leave";
import { toIso } from "@/lib/leave-days";
import { addHoliday, deleteHoliday } from "../policy-actions";
import ConfirmDialog from "../../confirm-dialog";

const weekday = (d: Date) => d.toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });

export default async function HolidaysPage({ searchParams }: PageProps<"/admin/holidays">) {
  await requireUser(["ADMIN"]);
  const { year: y, error } = await searchParams;
  const year = /^\d{4}$/.test(String(y)) ? Number(y) : Number((await todayIso()).slice(0, 4));
  const holidays = await db.holiday.findMany({
    where: { date: { gte: fromIso(`${year}-01-01`), lte: fromIso(`${year}-12-31`) } },
    orderBy: { date: "asc" },
  });
  const optionalCount = holidays.filter((h) => h.isOptional).length;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="h1 mb-0 mr-auto">Holidays {year}</h1>
        <Link className="btn" href={`/admin/holidays?year=${year - 1}`}>← {year - 1}</Link>
        <Link className="btn" href={`/admin/holidays?year=${year + 1}`}>{year + 1} →</Link>
      </div>
      {typeof error === "string" && <p className="error">{error}</p>}
      <form action={addHoliday} className="card grid gap-3 sm:grid-cols-[160px_1fr_auto_auto] sm:items-center">
        <input className="input" name="date" type="date" required />
        <input className="input" name="name" placeholder="Occasion" required />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="isOptional" /> Optional</label>
        <button className="btn btn-primary">Add</button>
      </form>
      <p className="text-sm text-gray-600">
        {holidays.length - optionalCount} fixed holidays (office closed, not charged) · {optionalCount} optional holidays (open for Optional Leave).
      </p>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Date</th><th>Day</th><th>Occasion</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id} className="hover:bg-gray-50">
                <td>{toIso(h.date)}</td>
                <td>{weekday(h.date)}</td>
                <td>{h.name}</td>
                <td>{h.isOptional ? "Optional" : "Fixed"}</td>
                <td>
                  <ConfirmDialog
                    title="Delete Holiday?"
                    description="Are you sure you want to delete this holiday?"
                    confirmText="Delete Holiday"
                    action={deleteHoliday.bind(null, h.id)}
                  />
                </td>
                </tr>
            ))}
            {!holidays.length && <tr><td colSpan={5} className="text-gray-500">No holidays for {year} yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
export const metadata = { title: "Holidays" };

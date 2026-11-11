import { requireUser } from "@/lib/auth";
import { getBalances, todayIso } from "@/lib/leave";
import { ApplyForm } from "./apply-form";

export default async function ApplyPage() {
  const user = await requireUser();
  const [balances, today] = await Promise.all([getBalances(user.id), todayIso()]);
  const types = balances.map((b) => ({
    id: b.type.id,
    name: b.type.name,
    allowHalfDay: b.type.allowHalfDay,
    hint: b.type.needsBalance ? `${b.available} day(s) available` : "Unpaid",
  }));
  return (
    <div className="max-w-2xl">
      <h1 className="h1">Apply for leave</h1>
      <ApplyForm types={types} today={today} />
    </div>
  );
}
export const metadata = { title: "Apply for leave" };

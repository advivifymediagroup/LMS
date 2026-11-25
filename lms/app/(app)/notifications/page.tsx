import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { SubmitButton } from "../../submit-button";
import { markAllRead } from "./actions";

const when = (d: Date) => d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 200 });
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3">
        <p className="text-sm text-gray-600">{unread ? `${unread} unread` : "You're all caught up."}</p>
        {unread > 0 && <form action={markAllRead} className="ml-auto"><SubmitButton className="btn btn-sm" pendingText="Marking…">Mark all as read</SubmitButton></form>}
      </div>
      <ul className="card divide-y divide-[#f0ece6] p-0">
        {items.map((n) => (
          <li key={n.id}>
            <a href={`/notifications/${n.id}`} className="flex gap-3 px-4 py-3 hover:bg-[#fcfbf9]">
              <span className={`mt-1.5 size-2 flex-none rounded-full ${n.readAt ? "bg-transparent" : "bg-brand-500"}`} aria-label={n.readAt ? undefined : "Unread"} />
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] ${n.readAt ? "" : "font-bold"}`}>{n.title}</span>
                {n.body && <span className="block text-[13px] text-gray-600">{n.body}</span>}
              </span>
              <span className="flex-none text-xs text-gray-500">{when(n.createdAt)}</span>
            </a>
          </li>
        ))}
        {!items.length && <li className="px-4 py-8 text-center text-sm text-gray-500">No notifications yet.</li>}
      </ul>
    </div>
  );
}

export const metadata = { title: "Notifications" };

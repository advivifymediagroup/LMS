import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

/** Opening a notification marks it read, then goes to what it's about. */
export async function GET(_: Request, { params }: RouteContext<"/notifications/[id]">) {
  const user = await requireUser();
  const id = Number((await params).id);
  const n = Number.isInteger(id) ? await db.notification.findFirst({ where: { id, userId: user.id } }) : null;
  if (!n) redirect("/notifications");
  if (!n.readAt) await db.notification.update({ where: { id }, data: { readAt: new Date() } });
  redirect(n.href.startsWith("/") && !n.href.startsWith("//") ? n.href : "/notifications");
}

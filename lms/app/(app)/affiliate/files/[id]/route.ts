import { affiliateAccess, canViewSide } from "@/lib/affiliate";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: RouteContext<"/affiliate/files/[id]">) {
  const a = await affiliateAccess(await requireUser());
  const id = Number((await params).id);
  const file = Number.isInteger(id) ? await db.validationFile.findUnique({ where: { id }, include: { validation: { select: { side: true } } } }) : null;
  if (!file || !canViewSide(a, file.validation.side)) return new Response("Not found", { status: 404 });
  const inline = file.contentType === "application/pdf";
  return new Response(file.data, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: Request, { params }: RouteContext<"/documents/[id]/file">) {
  await requireUser();
  const id = Number((await params).id);
  const doc = Number.isInteger(id) ? await db.document.findUnique({ where: { id } }) : null;
  if (!doc) return new Response("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${doc.fileName}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

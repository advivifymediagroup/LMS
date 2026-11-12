import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ActionForm } from "../action-form";
import { deleteDocument, saveDocument } from "./actions";

const size = (n: number) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default async function DocumentsPage() {
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  // Leave out the file bytes; they're only read by the download route.
  const docs = await db.document.findMany({
    select: { id: true, title: true, fileName: true, size: true, createdAt: true, uploadedBy: { select: { name: true } } },
    orderBy: { title: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="h1">Policy documents</h1>
      {docs.length === 0 && <p className="text-gray-600">No documents yet.</p>}
      <ul className="space-y-3">
        {docs.map((d) => (
          <li key={d.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <div className="font-medium">{d.title}</div>
                <div className="text-xs text-gray-500">
                  {d.fileName} · {size(d.size)} · updated {d.createdAt.toISOString().slice(0, 10)}{isAdmin && ` by ${d.uploadedBy.name}`}
                </div>
              </div>
              <a className="btn" href={`/documents/${d.id}/file`} target="_blank" rel="noopener">View</a>
              <a className="btn" href={`/documents/${d.id}/file?download=1`}>Download</a>
            </div>
            {isAdmin && (
              <details className="text-sm">
                <summary className="cursor-pointer text-brand-600">Replace or delete</summary>
                <div className="mt-3 flex flex-wrap items-end gap-4">
                  <ActionForm action={saveDocument.bind(null, d.id)} submit="Replace" className="flex flex-wrap items-end gap-2">
                    <input className="input w-56" name="title" defaultValue={d.title} aria-label="Title" required maxLength={200} />
                    <input className="input w-64" name="file" type="file" accept="application/pdf,.pdf" aria-label="New PDF" required />
                  </ActionForm>
                  <form action={deleteDocument.bind(null, d.id)}>
                    <button className="btn btn-danger">Delete</button>
                  </form>
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
      {isAdmin && (
        <ActionForm action={saveDocument.bind(null, null)} submit="Upload">
          <h2 className="font-semibold">Upload a document</h2>
          <div>
            <label className="label" htmlFor="title">Title</label>
            <input className="input" id="title" name="title" required maxLength={200} placeholder="Leave Policy 2026" />
          </div>
          <div>
            <label className="label" htmlFor="file">PDF file (up to 10 MB)</label>
            <input className="input" id="file" name="file" type="file" accept="application/pdf,.pdf" required />
          </div>
        </ActionForm>
      )}
    </div>
  );
}
export const metadata = { title: "Policies" };

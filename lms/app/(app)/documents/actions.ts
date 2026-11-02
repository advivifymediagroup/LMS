"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import type { FormState } from "../admin/actions";

const MAX_BYTES = 10 * 1024 * 1024; // keep in sync with serverActions.bodySizeLimit in next.config.ts

/** Upload a new policy PDF, or replace the file (and title) of an existing one when id is given. */
export async function saveDocument(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  const admin = await requireUser(["ADMIN"]);
  const title = String(form.get("title") ?? "").trim();
  const file = form.get("file");
  if (!title || title.length > 200) return { error: "Enter a title (up to 200 characters)." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a PDF file." };
  if (file.size > MAX_BYTES) return { error: "The file is larger than 10 MB." };
  const data = Buffer.from(await file.arrayBuffer());
  // Check the file's content, not just its name: every PDF starts with "%PDF-".
  if (data.subarray(0, 5).toString("latin1") !== "%PDF-") return { error: "Only PDF files are allowed." };

  const fileName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 150) || "document.pdf";
  const fields = { title, fileName, size: data.length, data, uploadedById: admin.id };
  if (id) await db.document.update({ where: { id }, data: { ...fields, createdAt: new Date() } });
  else await db.document.create({ data: fields });
  revalidatePath("/documents");
  return { ok: id ? `Replaced "${title}".` : `Uploaded "${title}".` };
}

export async function deleteDocument(id: number) {
  await requireUser(["ADMIN"]);
  await db.document.deleteMany({ where: { id } });
  revalidatePath("/documents");
}

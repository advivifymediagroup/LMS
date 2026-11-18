"use server";

import { Prisma, type InvoiceStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requireFinance } from "@/lib/finance";
import { fromIso, todayIso } from "@/lib/leave";
import type { FormState } from "../admin/actions";

const Input = z.object({
  number: z.string().trim().min(1, "Invoice number is required.").max(40),
  client: z.string().trim().min(1, "Client is required.").max(200),
  description: z.string().trim().max(2000).optional().transform((v) => v || null),
  amount: z.coerce.number().positive("Amount must be more than 0.").max(1e10),
  currency: z.enum(["INR", "USD", "AED", "EUR", "GBP"]).default("INR"),
  issueDate: z.iso.date("Issue date is required."),
  dueDate: z.iso.date("Due date is required."),
  notes: z.string().trim().max(2000).optional().transform((v) => v || null),
});

export async function saveInvoice(id: number | null, _: FormState, form: FormData): Promise<FormState> {
  const me = await requireFinance();
  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { issueDate, dueDate, ...rest } = parsed.data;
  if (dueDate < issueDate) return { error: "Due date can't be before the issue date." };
  const data = { ...rest, issueDate: fromIso(issueDate), dueDate: fromIso(dueDate) };
  let invoiceId = id;
  try {
    if (id) {
      const before = await db.invoice.findUnique({ where: { id } });
      if (!before) return { error: "That invoice no longer exists." };
      await db.invoice.update({ where: { id }, data });
      await writeAudit(db, { actorId: me.id, action: "UPDATE", entityType: "INVOICE", entityId: id, before, after: data });
    } else {
      const inv = await db.invoice.create({ data: { ...data, createdById: me.id } });
      invoiceId = inv.id;
      await writeAudit(db, { actorId: me.id, action: "CREATE", entityType: "INVOICE", entityId: inv.id, after: data });
    }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { error: "That invoice number is already used." };
    throw e;
  }
  revalidatePath("/finance");
  if (!id) redirect(`/finance/invoices/${invoiceId}`);
  return { ok: "Invoice saved." };
}

export async function setInvoiceStatus(id: number, status: InvoiceStatus) {
  const me = await requireFinance();
  const before = await db.invoice.findUnique({ where: { id } });
  if (!before || before.status === status) return;
  const paidDate = status === "PAID" ? fromIso(await todayIso()) : null;
  await db.invoice.update({ where: { id }, data: { status, paidDate } });
  await writeAudit(db, { actorId: me.id, action: "STATUS", entityType: "INVOICE", entityId: id, before: { status: before.status }, after: { status, paidDate } });
  revalidatePath("/finance");
  revalidatePath(`/finance/invoices/${id}`);
}

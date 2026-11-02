import nodemailer from "nodemailer";
import { getSetting } from "./leave";

export type SmtpSettings = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

/** Sends one plain-text email using the SMTP settings. Throws on SMTP errors. */
export async function sendMail(msg: { to: string[]; cc?: string[]; subject: string; text: string }) {
  const to = [...new Set(msg.to.filter(Boolean))];
  const cc = [...new Set((msg.cc ?? []).filter((e) => e && !to.includes(e)))];
  if (!to.length) return;
  const smtp = await getSetting<SmtpSettings | null>("smtp", null);
  if (!smtp?.host) {
    console.warn(`[mail] SMTP not configured, skipped: "${msg.subject}" to ${to.join(", ")}`);
    return;
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: Number(smtp.port),
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  await transport.sendMail({ from: smtp.from, to, cc, subject: msg.subject, text: msg.text });
}

/** Notification emails must never break the action that triggered them. */
export async function sendMailSafe(msg: Parameters<typeof sendMail>[0]) {
  try {
    await sendMail(msg);
  } catch (e) {
    console.error(`[mail] failed: "${msg.subject}"`, e);
  }
}

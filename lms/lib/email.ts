// Branded HTML email layout (table-based, inline styles, so it renders in Gmail and Outlook).
// Every notification also keeps its plain-text version as the fallback.
import { appUrl } from "./notify";

const C = { char: "#2F3237", ink: "#1F2124", paper: "#F7F5F2", sand: "#EFECE7", line: "#E3DFD8", muted: "#6B6E73", body: "#4A4D52", brand: "#FF6B1A", brandText: "#C2470A", brandSoft: "#FFEEE3", link: "#FF8A47" };
const FONT = "Arial,Helvetica,sans-serif";
const MONO = "'Courier New',Courier,monospace";

export type Tone = "pending" | "approved" | "rejected" | "neutral";
const PILL: Record<Tone, [string, string]> = {
  pending: [C.brandSoft, C.brandText],
  approved: [C.char, C.paper],
  rejected: ["#FEF2F2", "#991B1B"],
  neutral: [C.sand, C.muted],
};

export type EmailContent = {
  preheader: string; // inbox preview line
  eyebrow: string; // small label above the title
  title: string;
  intro: string;
  person?: { name: string; sub: string; pill?: { text: string; tone: Tone } };
  rows?: [string, string][];
  list?: { title: string; sub: string }[];
  callout?: [string, string]; // bold label, text
  buttons?: { label: string; href: string; primary?: boolean }[];
  fine?: string; // small print under the buttons
  footer: string; // why they got this email
};

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const initials = (name: string) => name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
const table = (inner: string, attrs = "") => `<table role="presentation" cellpadding="0" cellspacing="0" border="0" ${attrs}>${inner}</table>`;
const pill = (text: string, tone: Tone) => `<span style="display:inline-block;padding:4px 10px;border-radius:12px;background-color:${PILL[tone][0]};font-family:${FONT};font-size:12px;font-weight:bold;color:${PILL[tone][1]};">${esc(text)}</span>`;
const section = (inner: string, pad: string) => `<tr><td bgcolor="${C.paper}" class="px" style="background-color:${C.paper};padding:${pad};">${inner}</td></tr>`;

function card(e: EmailContent) {
  const parts: string[] = [];
  if (e.person) {
    const p = e.person;
    parts.push(`<tr><td style="padding:20px 24px;${e.rows?.length ? `border-bottom:1px solid ${C.sand};` : ""}">${table(`<tr>
<td width="40" style="width:40px;">${table(`<tr><td width="40" height="40" align="center" bgcolor="${C.char}" style="width:40px;height:40px;background-color:${C.char};border-radius:20px;font-family:${FONT};font-size:13px;font-weight:bold;color:#FFFFFF;line-height:40px;">${esc(initials(p.name))}</td></tr>`)}</td>
<td style="padding-left:12px;font-family:${FONT};"><div style="font-size:15px;font-weight:bold;color:${C.ink};line-height:20px;">${esc(p.name)}</div><div style="font-size:13px;color:${C.muted};line-height:18px;">${esc(p.sub)}</div></td>
${p.pill ? `<td align="right">${pill(p.pill.text, p.pill.tone)}</td>` : ""}</tr>`, `width="100%"`)}</td></tr>`);
  }
  if (e.rows?.length) {
    const rows = e.rows.map(([k, v], i) => {
      const b = i < e.rows!.length - 1 ? `border-bottom:1px solid ${C.sand};` : "";
      return `<tr><td width="42%" valign="top" style="padding:10px 0;color:${C.muted};${b}">${esc(k)}</td><td style="padding:10px 0;color:${C.ink};font-weight:bold;line-height:21px;${b}">${esc(v)}</td></tr>`;
    });
    parts.push(`<tr><td style="padding:8px 24px 12px 24px;">${table(rows.join(""), `width="100%" style="font-family:${FONT};font-size:14px;"`)}</td></tr>`);
  }
  if (e.list?.length) {
    const items = e.list.map((it, i) => `<tr><td style="padding:14px 24px;${i ? `border-top:1px solid ${C.sand};` : ""}font-family:${FONT};"><div style="font-size:15px;font-weight:bold;color:${C.ink};line-height:20px;">${esc(it.title)}</div><div style="font-size:13px;color:${C.muted};line-height:19px;">${esc(it.sub)}</div></td></tr>`);
    parts.push(items.join(""));
  }
  return parts.length ? section(table(parts.join(""), `width="100%" bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid ${C.line};border-radius:12px;"`), "24px 40px") : "";
}

function buttons(e: EmailContent) {
  if (!e.buttons?.length && !e.fine) return "";
  const cells = (e.buttons ?? []).map((b, i) => {
    const btn = b.primary
      ? `<td bgcolor="${C.brand}" style="background-color:${C.brand};border-radius:10px;"><a href="${esc(b.href)}" style="display:block;padding:14px 26px;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.ink};text-decoration:none;border-radius:10px;line-height:18px;">${esc(b.label)}</a></td>`
      : `<td bgcolor="#FFFFFF" style="background-color:#FFFFFF;border:1px solid #C9C4BC;border-radius:10px;"><a href="${esc(b.href)}" style="display:block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:${C.char};text-decoration:none;border-radius:10px;line-height:18px;">${esc(b.label)}</a></td>`;
    return `${i ? `<td width="12" class="stack" style="width:12px;font-size:0;">&nbsp;</td>` : ""}<td class="stack${i ? " stack-gap" : ""}">${table(`<tr>${btn}</tr>`)}</td>`;
  });
  const fine = e.fine ? `<p style="margin:${cells.length ? "20px" : "0"} 0 0 0;font-family:${FONT};font-size:13px;color:${C.muted};line-height:20px;">${esc(e.fine)}</p>` : "";
  return section((cells.length ? table(`<tr>${cells.join("")}</tr>`) : "") + fine, "16px 40px 36px 40px");
}

export function renderEmail(e: EmailContent) {
  const logo = appUrl("/email-logo.png");
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark">
<title>${esc(e.title)}</title>
<style>@media (max-width:620px){.wrap{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.stack{display:block!important;width:100%!important}.stack-gap{padding:12px 0 0 0!important}}</style>
</head>
<body style="margin:0;padding:0;background-color:${C.sand};">
<span style="display:none;font-size:1px;color:${C.sand};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${esc(e.preheader)}</span>
${table(`<tr><td align="center" style="padding:32px 12px;">
${table(`
<tr><td bgcolor="${C.char}" class="px" style="background-color:${C.char};padding:22px 40px;border-radius:12px 12px 0 0;">
${table(`<tr><td width="32" style="width:32px;"><img src="${logo}" width="32" height="32" alt="" style="display:block;border:0;"></td>
<td style="padding-left:10px;font-family:${FONT};font-size:19px;font-weight:bold;letter-spacing:-0.5px;color:${C.paper};line-height:22px;">advivify<span style="color:${C.brand};">.</span></td>
<td align="right" style="font-family:${MONO};font-size:11px;letter-spacing:1px;color:#A9ACB2;text-transform:uppercase;">Portal</td></tr>`, `width="100%"`)}
</td></tr>
<tr><td bgcolor="${C.brand}" height="4" style="background-color:${C.brand};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
${section(`<p style="margin:0 0 10px 0;font-family:${MONO};font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${C.brandText};">${esc(e.eyebrow)}</p>
<h1 style="margin:0 0 14px 0;font-family:${FONT};font-size:26px;font-weight:bold;color:${C.ink};line-height:32px;">${esc(e.title)}</h1>
<p style="margin:0;font-family:${FONT};font-size:15px;color:${C.body};line-height:24px;">${esc(e.intro)}</p>`, `40px 40px ${e.person || e.rows || e.list ? "8px" : "24px"} 40px`)}
${card(e)}
${e.callout ? section(table(`<tr><td style="padding:14px 18px;font-family:${FONT};font-size:13px;color:${C.char};line-height:20px;"><strong>${esc(e.callout[0])}</strong> ${esc(e.callout[1])}</td></tr>`, `width="100%" bgcolor="${C.sand}" style="background-color:${C.sand};border-radius:10px;"`), "0 40px 16px 40px") : ""}
${buttons(e)}
<tr><td bgcolor="${C.char}" class="px" style="background-color:${C.char};padding:24px 40px;border-radius:0 0 12px 12px;">
<p style="margin:0 0 8px 0;font-family:${FONT};font-size:12px;color:#C4C7CC;line-height:18px;">${esc(e.footer)}</p>
<p style="margin:0;font-family:${FONT};font-size:12px;color:#8D9096;line-height:18px;">Advivify · Internal portal · <a href="${appUrl("/dashboard")}" style="color:${C.link};text-decoration:underline;">${esc(appUrl("").replace(/^https?:\/\//, ""))}</a></p>
</td></tr>`, `width="600" class="wrap" style="width:600px;max-width:600px;"`)}
</td></tr>`, `width="100%" style="background-color:${C.sand};"`)}
</body></html>`;
}

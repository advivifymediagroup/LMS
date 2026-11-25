// Affiliate validation rules: statuses per side, who may move a record where, file checks.
// No imports, so client components and tests can use it.

export type Side = "SALES" | "DELIVERY";
export type Status =
  | "DRAFT" | "SUBMITTED" | "UNDER_REVIEW" | "PENDING_FINANCE_REVIEW" | "READY_TO_SEND" | "SENT_TO_PUBLISHER"
  | "ACKNOWLEDGED" | "DISPUTED" | "REVISED" | "APPROVED" | "PARTIALLY_APPROVED" | "INVOICE_RECEIVED"
  | "PAYMENT_PENDING" | "PAID" | "CLOSED";

export const SIDES = {
  SALES: { slug: "sales", label: "Sales", team: "Sales", prefix: "SV", partner: "Client" },
  DELIVERY: { slug: "delivery", label: "Delivery", team: "Delivery", prefix: "DV", partner: "Publisher" },
} as const;
export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "AED"] as const;
export const OFFER_MODELS = ["CPI", "CPA", "CPS", "CPL", "CPR"] as const;
export const PLATFORMS = [["ANDROID", "Android"], ["IOS", "iOS"], ["WEB", "Web"]] as const;

export const sideFromSlug = (slug: string): Side | null =>
  slug === "sales" ? "SALES" : slug === "delivery" ? "DELIVERY" : null;

export const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Draft", SUBMITTED: "Submitted", UNDER_REVIEW: "Under review", PENDING_FINANCE_REVIEW: "Pending Finance review",
  READY_TO_SEND: "Ready to send", SENT_TO_PUBLISHER: "Sent to publisher", ACKNOWLEDGED: "Acknowledged", DISPUTED: "Disputed",
  REVISED: "Revised", APPROVED: "Approved", PARTIALLY_APPROVED: "Partially approved", INVOICE_RECEIVED: "Invoice received",
  PAYMENT_PENDING: "Payment pending", PAID: "Paid", CLOSED: "Closed",
};

/** Statuses in workflow order, per side (from the TRD). */
export const STATUSES: Record<Side, Status[]> = {
  SALES: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "DISPUTED", "APPROVED", "PARTIALLY_APPROVED", "CLOSED"],
  DELIVERY: ["DRAFT", "SUBMITTED", "PENDING_FINANCE_REVIEW", "READY_TO_SEND", "SENT_TO_PUBLISHER", "ACKNOWLEDGED", "DISPUTED",
    "REVISED", "APPROVED", "INVOICE_RECEIVED", "PAYMENT_PENDING", "PAID", "CLOSED"],
};

/** "team" = the side's own team, "finance" = Finance, "any" = either. Admins can make every move. */
type Who = "team" | "finance" | "any";
type Move = { to: Status; label: string; who: Who };
const m = (to: Status, label: string, who: Who): Move => ({ to, label, who });

export const MOVES: Record<Side, Partial<Record<Status, Move[]>>> = {
  SALES: {
    DRAFT: [m("SUBMITTED", "Submit for review", "team")],
    SUBMITTED: [m("UNDER_REVIEW", "Start review", "finance"), m("APPROVED", "Approve", "finance"), m("PARTIALLY_APPROVED", "Partially approve", "finance"),
      m("DISPUTED", "Mark disputed", "any"), m("DRAFT", "Withdraw to draft", "team")],
    UNDER_REVIEW: [m("APPROVED", "Approve", "finance"), m("PARTIALLY_APPROVED", "Partially approve", "finance"), m("DISPUTED", "Mark disputed", "any")],
    DISPUTED: [m("SUBMITTED", "Resubmit", "team")],
    APPROVED: [m("CLOSED", "Close", "finance")],
    PARTIALLY_APPROVED: [m("CLOSED", "Close", "finance")],
  },
  DELIVERY: {
    DRAFT: [m("SUBMITTED", "Submit for Finance review", "team")],
    SUBMITTED: [m("PENDING_FINANCE_REVIEW", "Start review", "finance"), m("READY_TO_SEND", "Approve: ready to send", "finance"), m("DRAFT", "Withdraw to draft", "team")],
    PENDING_FINANCE_REVIEW: [m("READY_TO_SEND", "Approve: ready to send", "finance"), m("SUBMITTED", "Send back to team", "finance")],
    READY_TO_SEND: [m("SENT_TO_PUBLISHER", "Mark sent to publisher", "team")],
    SENT_TO_PUBLISHER: [m("ACKNOWLEDGED", "Publisher acknowledged", "team"), m("DISPUTED", "Publisher disputed", "team")],
    DISPUTED: [m("REVISED", "Mark revised", "team")],
    REVISED: [m("PENDING_FINANCE_REVIEW", "Resubmit to Finance", "team"), m("SENT_TO_PUBLISHER", "Resend to publisher", "team")],
    ACKNOWLEDGED: [m("APPROVED", "Final amount agreed", "any")],
    APPROVED: [m("INVOICE_RECEIVED", "Invoice received", "any"), m("PAYMENT_PENDING", "Payment pending", "finance")],
    INVOICE_RECEIVED: [m("PAYMENT_PENDING", "Payment pending", "finance")],
    PAYMENT_PENDING: [m("PAID", "Mark paid", "finance")],
    PAID: [m("CLOSED", "Close", "finance")],
  },
};

export type Actor = { admin: boolean; finance: boolean; team: boolean };

/** Moves this person may make from the record's current status. */
export function allowedMoves(side: Side, status: Status, a: Actor): Move[] {
  return (MOVES[side][status] ?? []).filter((mv) =>
    a.admin || (mv.who === "team" ? a.team : mv.who === "finance" ? a.finance : a.team || a.finance));
}

/** Figures can be edited by the owning team only before approval; admins always (still audited). */
export const EDITABLE: Record<Side, Status[]> = {
  SALES: ["DRAFT", "SUBMITTED", "DISPUTED"],
  DELIVERY: ["DRAFT", "SUBMITTED", "DISPUTED", "REVISED"],
};
/**
 * Past approval, figures change only through a revision: a written reason, the revision number goes up,
 * and the record goes back for review. These are the statuses the team may revise from.
 * Once payment is under way (Payment pending, Paid, Closed) only an admin can revise, and the status stays.
 */
export const REVISABLE: Record<Side, Status[]> = {
  SALES: ["APPROVED", "PARTIALLY_APPROVED"],
  DELIVERY: ["READY_TO_SEND", "SENT_TO_PUBLISHER", "ACKNOWLEDGED", "APPROVED", "INVOICE_RECEIVED"],
};
export const REVISION_TO: Record<Side, Status> = { SALES: "SUBMITTED", DELIVERY: "REVISED" };
/** Any status where an edit counts as a revision (needs a reason). */
export const needsRevision = (side: Side, status: Status) => !EDITABLE[side].includes(status) && status !== "PENDING_FINANCE_REVIEW" && status !== "UNDER_REVIEW";

export const canEditRecord = (side: Side, status: Status, a: Actor) =>
  a.admin || (a.team && (EDITABLE[side].includes(status) || REVISABLE[side].includes(status)));

/** Statuses that need a written reason. */
export const NEEDS_NOTE: Status[] = ["DISPUTED", "PARTIALLY_APPROVED"];

// ---------- Money: what counts, reconciliation ----------

/** Where a record stands for the money figures. Only "approved" counts as validated revenue or cost. */
export type Bucket = "draft" | "pending" | "disputed" | "approved";
const APPROVED_SET: Record<Side, Status[]> = {
  SALES: ["APPROVED", "PARTIALLY_APPROVED", "CLOSED"],
  DELIVERY: ["APPROVED", "INVOICE_RECEIVED", "PAYMENT_PENDING", "PAID", "CLOSED"],
};
export const bucket = (side: Side, s: Status): Bucket =>
  s === "DRAFT" ? "draft" : s === "DISPUTED" ? "disputed" : APPROVED_SET[side].includes(s) ? "approved" : "pending";

/** Publisher payment state (Delivery only): due = approved and not yet paid. */
export type Payment = "not_due" | "due" | "paid";
export const PAYMENT_LABEL: Record<Payment, string> = { not_due: "Not yet due", due: "Due", paid: "Paid" };
export const payment = (s: Status): Payment =>
  s === "PAID" || s === "CLOSED" ? "paid" : APPROVED_SET.DELIVERY.includes(s) ? "due" : "not_due";
export const PAYMENT_STATUSES: Record<Payment, Status[]> = {
  paid: ["PAID", "CLOSED"],
  due: ["APPROVED", "INVOICE_RECEIVED", "PAYMENT_PENDING"],
  not_due: STATUSES.DELIVERY.filter((s) => !APPROVED_SET.DELIVERY.includes(s)),
};

export type MoneyRow = {
  side: Side; status: Status; campaignId: number; month: string; geo: string; currency: string;
  publisherId: number | null; netAmount: number; approvedAmount: number | null; approvedConversions: number;
};
/** The amount a record contributes: the approved part of a partial approval, else the net amount. */
export const counted = (r: Pick<MoneyRow, "side" | "status" | "netAmount" | "approvedAmount">) =>
  bucket(r.side, r.status) === "approved" && r.approvedAmount != null ? r.approvedAmount : r.netAmount;

const zero = (): Record<Bucket, number> => ({ draft: 0, pending: 0, disputed: 0, approved: 0 });
export type RecRow = {
  campaignId: number; month: string; geo: string; currency: string;
  revenue: Record<Bucket, number>; cost: Record<Bucket, number>;
  clientConv: number; publisherConv: number;
  /** Approved and in-progress cost per publisher. */
  publishers: Map<number, { approved: number; open: number }>;
  margin: number; marginPct: number | null;
};

/**
 * Campaign-level reconciliation: rows matched by campaign, month, GEO and currency (never across currencies).
 * Margin uses approved figures only; conversions are shown side by side, never forced to match.
 */
export function reconcile(rows: MoneyRow[]): RecRow[] {
  const by = new Map<string, RecRow>();
  for (const r of rows) {
    const key = `${r.campaignId}|${r.month}|${r.geo}|${r.currency}`;
    let g = by.get(key);
    if (!g) by.set(key, (g = { campaignId: r.campaignId, month: r.month, geo: r.geo, currency: r.currency, revenue: zero(), cost: zero(), clientConv: 0, publisherConv: 0, publishers: new Map(), margin: 0, marginPct: null }));
    const b = bucket(r.side, r.status);
    const amt = counted(r);
    if (r.side === "SALES") {
      g.revenue[b] += amt;
      if (b === "approved") g.clientConv += r.approvedConversions;
    } else {
      g.cost[b] += amt;
      if (b === "approved") g.publisherConv += r.approvedConversions;
      if (r.publisherId != null && b !== "draft") {
        const p = g.publishers.get(r.publisherId) ?? { approved: 0, open: 0 };
        if (b === "approved") p.approved += amt; else p.open += amt;
        g.publishers.set(r.publisherId, p);
      }
    }
  }
  const cents = (n: number) => Math.round(n * 100) / 100;
  return [...by.values()].map((g) => {
    for (const k of Object.keys(g.revenue) as Bucket[]) { g.revenue[k] = cents(g.revenue[k]); g.cost[k] = cents(g.cost[k]); }
    g.margin = cents(g.revenue.approved - g.cost.approved);
    g.marginPct = g.revenue.approved ? Math.round((g.margin / g.revenue.approved) * 1000) / 10 : null;
    return g;
  });
}

// ---------- Uploaded files ----------
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // keep in sync with serverActions.bodySizeLimit in next.config.ts
export const FILE_ACCEPT = ".pdf,.csv,.xls,.xlsx";

/** Content type for an allowed upload, checked by its bytes, or null. */
export function fileType(name: string, head: Uint8Array): string | null {
  const ext = name.toLowerCase().split(".").pop();
  const starts = (...b: number[]) => b.every((x, i) => head[i] === x);
  if (ext === "pdf" && starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf";
  if (ext === "xlsx" && starts(0x50, 0x4b, 0x03, 0x04)) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls" && starts(0xd0, 0xcf, 0x11, 0xe0)) return "application/vnd.ms-excel";
  if (ext === "csv" && !head.includes(0)) return "text/csv";
  return null;
}

// ---------- Notifications ----------
/** Who hears about a record reaching each status. The person who made the change is never notified. */
export type Audience = "finance" | "owner";
export const NOTIFY: Record<Side, Partial<Record<Status, Audience[]>>> = {
  SALES: { SUBMITTED: ["finance"], DISPUTED: ["owner", "finance"], APPROVED: ["owner"], PARTIALLY_APPROVED: ["owner"] },
  DELIVERY: {
    SUBMITTED: ["finance"], PENDING_FINANCE_REVIEW: ["finance"], READY_TO_SEND: ["owner"], DISPUTED: ["owner", "finance"],
    APPROVED: ["finance"], INVOICE_RECEIVED: ["finance"], PAYMENT_PENDING: ["finance"], PAID: ["owner"],
  },
};
/** Statuses where the record still needs someone to act (reminders go out when they sit too long). */
export const UNRESOLVED: Record<Side, Status[]> = {
  SALES: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "DISPUTED"],
  DELIVERY: STATUSES.DELIVERY.filter((s) => s !== "PAID" && s !== "CLOSED"),
};

// ---------- Bulk upload ----------
type Col = { header: string; field: string; required?: boolean; example: string };
const c = (header: string, field: string, example: string, required = false): Col => ({ header, field, example, required });
export const IMPORT_COLUMNS: Record<Side, Col[]> = {
  SALES: [
    c("Month", "month", "2026-11", true), c("Client", "client", "Acme Ads", true), c("Campaign", "campaign", "Acme Summer CPI", true),
    c("Client campaign ID", "clientRef", "AC-123"), c("GEO", "geo", "IN"), c("Platform", "platform", "Android"), c("Offer model", "offerModel", "CPI"),
    c("Total conversions", "totalConversions", "1200", true), c("Approved conversions", "approvedConversions", "1150", true),
    c("Rejected conversions", "rejectedConversions", "50"), c("Approved amount", "amount", "5750", true), c("Deduction", "deduction", "0"),
    c("Currency", "currency", "USD", true), c("Remarks", "remarks", ""),
  ],
  DELIVERY: [
    c("Month", "month", "2026-11", true), c("Client", "client", "Acme Ads", true), c("Campaign", "campaign", "Acme Summer CPI", true),
    c("Publisher", "publisher", "Blue Media", true), c("GEO", "geo", "IN"), c("Platform", "platform", "Android"), c("Offer model", "offerModel", "CPI"),
    c("Delivered conversions", "totalConversions", "600", true), c("Approved conversions", "approvedConversions", "580", true),
    c("Rejected conversions", "rejectedConversions", "20"), c("Payout rate", "payoutRate", "2"), c("Gross amount", "amount", ""),
    c("Deduction", "deduction", "0"), c("Currency", "currency", "USD", true), c("Invoice number", "invoiceNumber", ""),
    c("Invoice date", "invoiceDate", ""), c("Remarks", "remarks", ""),
  ],
};
export const MAX_IMPORT_ROWS = 1000;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number | string) => String(n).padStart(2, "0");
/** "2026-11", "2026-11-01", "11/2026", "Nov-26", "November 2026", "01/11/2026" → "2026-11"; else the input unchanged. */
export function normMonth(v: string) {
  const s = v.trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/);
  if (m) return `${m[1]}-${pad(m[2])}`;
  m = s.match(/^(?:\d{1,2}[-/.])?(\d{1,2})[-/.](\d{4})$/);
  if (m) return `${m[2]}-${pad(m[1])}`;
  m = s.match(/^([a-z]{3})[a-z]*[-\s']+(\d{2}|\d{4})$/i);
  const i = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  if (m && i >= 0) return `${m[2].length === 2 ? "20" + m[2] : m[2]}-${pad(i + 1)}`;
  return s;
}
/** "2026-11-05", "05/11/2026", "05-11-2026", "05.11.2026" (day first) → "2026-11-05"; else unchanged. */
export function normDate(v: string) {
  const s = v.trim();
  const m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : s.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})$/, (_, y, mo, d) => `${y}-${pad(mo)}-${pad(d)}`);
}
/** "1,234.50", " $5 000 " → "1234.50", "5000". */
export const normNumber = (v: string) => v.replace(/[\s,$€£₹]/g, "");

const key = (h: string) => h.toLowerCase().replace(/\(.*?\)|\*/g, "").replace(/[^a-z]/g, "");

/** Spreadsheet rows (header first) → one object of raw values per line, keyed by form field. */
export function readSheet(side: Side, rows: string[][]): { error: string } | { lines: { line: number; values: Record<string, string> }[] } {
  if (!rows.length) return { error: "The file is empty." };
  const cols = IMPORT_COLUMNS[side];
  const at = rows[0].map(key);
  const index = new Map(cols.map((col) => [col.field, at.indexOf(key(col.header))]));
  const missing = cols.filter((col) => col.required && index.get(col.field)! < 0).map((col) => col.header);
  if (missing.length) return { error: `The header row is missing: ${missing.join(", ")}. Download the ${side === "SALES" ? "Sales" : "Delivery"} template and keep its first row.` };
  if (rows.length - 1 > MAX_IMPORT_ROWS) return { error: `Up to ${MAX_IMPORT_ROWS} rows per file. Split it into smaller files.` };
  if (rows.length === 1) return { error: "The file has a header row but no records." };
  const numeric = ["totalConversions", "approvedConversions", "rejectedConversions", "amount", "payoutRate", "deduction"];
  return {
    lines: rows.slice(1).map((r, i) => {
      const values: Record<string, string> = {};
      for (const col of cols) {
        let v = (r[index.get(col.field)!] ?? "").trim();
        if (col.field === "month") v = normMonth(v);
        else if (col.field === "invoiceDate") v = normDate(v);
        else if (numeric.includes(col.field)) v = normNumber(v);
        else if (["currency", "offerModel", "platform"].includes(col.field)) v = v.toUpperCase();
        values[col.field] = v;
      }
      return { line: i + 2, values };
    }),
  };
}

// ---------- History ----------
// Figures worth showing in the history when they change.
const TRACKED: [string, string][] = [
  ["totalConversions", "Total conv."], ["approvedConversions", "Approved conv."], ["rejectedConversions", "Rejected conv."],
  ["payoutRate", "Payout rate"], ["amount", "Amount"], ["deduction", "Deduction"], ["netAmount", "Net"], ["currency", "Currency"],
  ["month", "Month"], ["geo", "GEO"], ["invoiceNumber", "Invoice no."], ["invoiceDate", "Invoice date"],
  ["approvedAmount", "Approved part"], ["paidDate", "Paid on"], ["paymentRef", "Payment ref."],
];
// Audit values: dates are stored as ISO timestamps; show just the day.
const show = (x: unknown) => (x == null || x === "" ? "—" : String(x).replace(/^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/, "$1"));

/** One audit entry of a validation in words: title, changed figures (old → new), note, file. */
export function describe(h: { action: string; before: unknown; after: unknown; metadata: unknown }) {
  const before = (h.before ?? {}) as Record<string, unknown>;
  const after = (h.after ?? {}) as Record<string, unknown>;
  const meta = (h.metadata ?? {}) as { note?: string; file?: string; importId?: string; line?: number };
  const label = (s: unknown) => STATUS_LABEL[s as Status] ?? String(s);
  const fields = h.action === "UPDATE" || h.action === "REVISION" ? TRACKED.filter(([k]) => show(before[k]) !== show(after[k])) : h.action === "STATUS" ? TRACKED.filter(([k]) => k in after) : [];
  const moved = after.status && before.status !== after.status ? `${label(before.status)} → ${label(after.status)}` : "";
  const title = h.action === "CREATE" ? "Created"
    : h.action === "IMPORT" ? `Created by bulk upload${meta.importId ? ` ${meta.importId}` : ""}${meta.line ? `, line ${meta.line}` : ""}${after.status && after.status !== "DRAFT" ? ` (${label(after.status)})` : ""}`
    : h.action === "STATUS" ? moved
    : h.action === "REVISION" ? `Revision ${String(after.revision)}${moved ? ` · ${moved}` : ""}`
    : h.action === "UPLOAD" ? "Uploaded a file" : "Edited";
  const changes = fields.map(([k, l]) => `${l}: ${h.action === "STATUS" ? show(after[k]) : `${show(before[k])} → ${show(after[k])}`}`);
  return { title, changes, note: meta.note, file: meta.file };
}

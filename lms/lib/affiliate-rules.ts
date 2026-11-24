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
export const canEditRecord = (side: Side, status: Status, a: Actor) => a.admin || (a.team && EDITABLE[side].includes(status));

/** Statuses that need a written reason. */
export const NEEDS_NOTE: Status[] = ["DISPUTED", "PARTIALLY_APPROVED"];

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

// Per-team setup: extra task fields and the monthly report template, keyed by team name.
// First drafts; each team's flow chart will refine them. No imports, so client components can use it.

export type TaskField =
  | { key: string; label: string; type: "text" | "url" | "number" | "date" }
  | { key: string; label: string; type: "select"; options: string[] };

const sel = (key: string, label: string, options: string[]): TaskField => ({ key, label, type: "select", options });
const f = (key: string, label: string, type: "text" | "url" | "number" | "date" = "text"): TaskField => ({ key, label, type });

export const TASK_FIELDS: Record<string, TaskField[]> = {
  Development: [
    sel("type", "Work type", ["Feature", "Bug fix", "Improvement", "Maintenance", "Research"]),
    f("project", "Project / product"),
    sel("environment", "Environment", ["Local", "Staging", "Production"]),
    f("link", "PR / ticket link", "url"),
    f("estimate", "Estimate (hours)", "number"),
  ],
  Sales: [
    f("client", "Client / lead"),
    sel("stage", "Stage", ["New lead", "Contacted", "Proposal sent", "Negotiation", "Won", "Lost"]),
    f("value", "Deal value (₹)", "number"),
    f("followUp", "Next follow-up", "date"),
  ],
  Marketing: [
    sel("channel", "Channel", ["SEO", "Social", "Email", "Content", "Partnerships", "Other"]),
    f("campaign", "Campaign"),
    f("link", "Content / asset link", "url"),
    f("publishOn", "Publish date", "date"),
  ],
  "Media Buying": [
    sel("platform", "Platform", ["Meta", "Google", "TikTok", "LinkedIn", "Other"]),
    f("campaign", "Campaign"),
    f("budget", "Budget (₹)", "number"),
    f("spend", "Spend so far (₹)", "number"),
  ],
  Design: [
    sel("deliverable", "Deliverable", ["Social post", "Banner / ad", "Landing page", "Logo / brand", "Video", "Other"]),
    f("requestedBy", "Requested by"),
    f("brief", "Brief link", "url"),
    f("revisions", "Revision rounds", "number"),
  ],
  Finance: [
    sel("category", "Category", ["Invoice", "Payment", "Payroll", "Reimbursement", "Appraisal", "Compliance", "Other"]),
    f("amount", "Amount (₹)", "number"),
    f("reference", "Invoice / reference no."),
  ],
};

/** Keeps only this team's fields, trimmed, dropping blanks and values not in a select's options. */
export function cleanTaskFields(team: string | undefined, form: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fd of TASK_FIELDS[team ?? ""] ?? []) {
    const v = String(form[`f_${fd.key}`] ?? "").trim().slice(0, 500);
    if (!v) continue;
    if (fd.type === "select" && !fd.options.includes(v)) continue;
    if (fd.type === "number" && !Number.isFinite(Number(v))) continue;
    if (fd.type === "url" && !/^https?:\/\//i.test(v)) continue;
    out[fd.key] = v;
  }
  return out;
}

// ---------- Monthly performance report ----------

export type ReportProject = { name: string; status: string; outcome: string };
export type ReportData = {
  summary: string;
  responsibilities: string[];
  achievements: string[];
  projects: ReportProject[];
  challenges: string;
  support: string;
  learning: string[];
  highlights: string[];
  selfAssessment: string;
  objectives: string[];
};
export const PROJECT_STATUSES = ["Completed", "In Progress", "In Testing", "On Hold"];

type ReportTemplate = {
  responsibilities: string[]; // pre-filled on a first report
  hints: Partial<Record<keyof ReportData, string>>;
  projectsTitle: string;
};

export const REPORT_TEMPLATES: Record<string, ReportTemplate> = {
  Development: {
    responsibilities: [
      "Full stack development of product websites and web applications.",
      "Implementing responsive frontend interfaces that work across browsers.",
      "Integrating frontend pages with backend services and APIs.",
      "Optimizing page performance, load times, and accessibility.",
      "Collaborating with the design and product teams to translate requirements into working pages.",
    ],
    projectsTitle: "Major Tasks Completed",
    hints: {
      summary: "What the month centred on: products shipped, releases, what is still in testing.",
      achievements: "One per line. Releases, features, fixes that mattered.",
      projects: "Pre-filled from your tasks this month, grouped by project. Edit freely.",
      challenges: "Technical blockers, environment or hosting issues, unclear requirements.",
      learning: "New tools, patterns or skills picked up.",
      highlights: "Up to three headline results.",
      objectives: "What you plan to ship next month.",
    },
  },
  // Other teams use this until their own templates are agreed.
  default: {
    responsibilities: [],
    projectsTitle: "Major Tasks Completed",
    hints: { projects: "Pre-filled from your tasks this month. Edit freely." },
  },
};
export const reportTemplate = (team: string | undefined) => REPORT_TEMPLATES[team ?? ""] ?? REPORT_TEMPLATES.default;

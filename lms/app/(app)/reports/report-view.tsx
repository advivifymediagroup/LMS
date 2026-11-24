// The monthly performance report, laid out like the Advivify report template. Prints to A4/Letter.
import type { ReportData } from "@/lib/team-config";
import { Logo } from "../../logo";

const mono = "font-mono text-[9.5px] tracking-[0.08em] uppercase text-gray-600";

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-[34px] mb-3 flex items-center gap-2.5 text-[19px] font-extrabold tracking-[-0.01em] text-char break-after-avoid">
      <span className="h-[18px] w-1 rounded-sm bg-brand-500" />{children}
    </h2>
  );
}
const Empty = () => <p className="text-sm text-gray-500 italic">Not filled in.</p>;

export function ReportView({ r }: {
  r: {
    name: string; designation: string; team: string; month: string; projectsTitle: string;
    attendance: { present: number; absent: number; sick: number; sickDates: string[] };
    data: ReportData; comment: string | null; reviewer?: string;
  };
}) {
  const d = r.data;
  const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
  const cell = "border-gray-300 px-3.5 py-3";
  return (
    <article className="mx-auto w-full max-w-[816px] rounded-[14px] border border-gray-200 bg-white px-6 py-8 text-ink sm:px-[52px] sm:py-[48px] print:max-w-none print:rounded-none print:border-0 print:p-0">
      <div className="flex items-center justify-between gap-4 border-b-2 border-char pb-3.5">
        <Logo size={24} />
        <span className="font-mono text-[10.5px] tracking-[0.08em] text-gray-600 uppercase">Reporting Month · {r.month}</span>
      </div>

      <h1 className="mt-7 mb-1.5 text-[34px] leading-[1.1] font-extrabold tracking-[-0.025em] text-char">Monthly Performance Report</h1>
      <p className="mb-[22px] text-[15px] text-gray-700">{r.name}{r.designation && ` · ${r.designation}`}</p>

      <div className="grid grid-cols-2 overflow-hidden rounded-[10px] border border-gray-300 break-inside-avoid sm:grid-cols-4">
        {[["Employee Name", r.name], ["Designation", r.designation || "—"], ["Department", r.team], ["Reporting Month", r.month]].map(([k, v], i) => (
          <div key={k} className={`${cell} border-b ${i % 2 === 0 ? "border-r" : "sm:border-r"} ${i === 3 ? "sm:border-r-0" : ""}`}>
            <div className={`${mono} mb-1`}>{k}</div><div className="text-[13.5px] font-bold">{v}</div>
          </div>
        ))}
        <div className={`${cell} border-r bg-paper`}><div className={mono}>Days Present</div><div className="text-[26px] font-extrabold tracking-[-0.02em] text-char">{r.attendance.present}</div></div>
        <div className={`${cell} bg-paper sm:border-r`}><div className={mono}>Days Absent</div><div className="text-[26px] font-extrabold tracking-[-0.02em] text-char">{r.attendance.absent}</div></div>
        <div className={`${cell} col-span-2 border-t bg-paper sm:border-t-0`}>
          <div className={mono}>Sick Leave</div>
          <div className="flex items-baseline gap-2.5"><span className="text-[26px] font-extrabold tracking-[-0.02em] text-brand-500">{r.attendance.sick}</span><span className="text-[13px] text-gray-700">{r.attendance.sickDates.map(day).join(", ")}</span></div>
        </div>
      </div>

      <H2>Summary</H2>
      {d.summary ? <p className="text-sm leading-[1.65] whitespace-pre-wrap text-char">{d.summary}</p> : <Empty />}

      <H2>Responsibilities</H2>
      {d.responsibilities.length ? <ul className="flex list-disc flex-col gap-0.5 pl-5 text-sm leading-[1.65] text-char">{d.responsibilities.map((x, i) => <li key={i}>{x}</li>)}</ul> : <Empty />}

      <H2>Key Achievements</H2>
      {d.achievements.length ? (
        <div className="flex flex-col border-t border-gray-300">
          {d.achievements.map((x, i) => (
            <div key={i} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-b border-gray-300 py-3 break-inside-avoid">
              <span className="pt-0.5 font-mono text-xs font-semibold text-brand-600">{String(i + 1).padStart(2, "0")}</span><p className="text-sm leading-[1.6]">{x}</p>
            </div>
          ))}
        </div>
      ) : <Empty />}

      <H2>{r.projectsTitle}</H2>
      {d.projects.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-[13px] leading-[1.55]">
            <thead><tr className="bg-char text-paper">
              {["Task/Project", "Status", "Outcome/Impact"].map((h, i) => <th key={h} className={`px-3 py-[9px] text-left font-mono text-[10px] font-semibold tracking-[0.08em] uppercase ${i === 0 ? "w-[26%]" : i === 1 ? "w-[17%]" : ""}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {d.projects.map((p, i) => (
                <tr key={i} className="border-b border-gray-300 break-inside-avoid">
                  <td className="px-3 py-[11px] align-top font-bold">{p.name}</td>
                  <td className="px-3 py-[11px] align-top"><span className={`inline-block rounded-full px-[9px] py-0.5 text-[11.5px] font-bold whitespace-nowrap ${p.status === "Completed" ? "bg-char text-paper" : "bg-brand-50 text-brand-700"}`}>{p.status}</span></td>
                  <td className="px-3 py-[11px] align-top text-char">{p.outcome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty />}

      <H2>Challenges / Roadblocks</H2>
      <div className="flex flex-col gap-2.5">
        <div className="rounded-[10px] border border-gray-300 px-4 py-3.5 break-inside-avoid"><div className={`${mono} mb-1.5`}>Challenge</div><p className="text-sm leading-[1.6] whitespace-pre-wrap">{d.challenges || "None this month."}</p></div>
        {d.support && <div className="rounded-[10px] bg-paper px-4 py-3.5 break-inside-avoid"><div className={`${mono} mb-1.5 !text-brand-700`}>Support required (if any)</div><p className="text-sm leading-[1.6] whitespace-pre-wrap">{d.support}</p></div>}
      </div>

      <H2>Learning &amp; Skill Development</H2>
      {d.learning.length ? <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-[1.65] text-char">{d.learning.map((x, i) => <li key={i}>{x}</li>)}</ul> : <Empty />}

      <H2>Performance Highlights</H2>
      {d.highlights.length ? (
        <div className="grid gap-2.5 break-inside-avoid sm:grid-cols-3">
          {d.highlights.map((x, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[10px] bg-char p-4 text-paper print:[print-color-adjust:exact]">
              <span className="font-mono text-[10px] tracking-[0.08em] text-brand-400 uppercase">Highlight {i + 1}</span><p className="text-[13.5px] leading-[1.55]">{x}</p>
            </div>
          ))}
        </div>
      ) : <Empty />}

      <H2>Self Assessment / Learnings</H2>
      {d.selfAssessment ? <p className="text-sm leading-[1.65] whitespace-pre-wrap text-char">{d.selfAssessment}</p> : <Empty />}

      <H2>Objectives Of Next Month</H2>
      {d.objectives.length ? (
        <div className="flex flex-col gap-2">
          {d.objectives.map((x, i) => (
            <div key={i} className="grid grid-cols-[22px_minmax(0,1fr)] items-start gap-2.5 break-inside-avoid">
              <span className="mt-1 size-3.5 rounded border-2 border-brand-500" /><p className="text-sm leading-[1.6]">{x}</p>
            </div>
          ))}
        </div>
      ) : <Empty />}

      <div className="mt-[34px] rounded-[10px] border border-dashed border-[#c9c4bd] px-[18px] py-4 break-inside-avoid">
        <div className="text-sm font-extrabold text-char">Comments</div>
        <div className="mb-3 text-[12.5px] text-gray-600">Brief summary of your contribution, progress, and areas of improvement.{r.reviewer && ` From ${r.reviewer}.`}</div>
        {r.comment ? <p className="text-sm leading-[1.6] whitespace-pre-wrap">{r.comment}</p> : <><div className="h-7 border-b border-gray-300" /><div className="h-7 border-b border-gray-300" /><div className="h-7 border-b border-gray-300" /></>}
      </div>

      <div className="mt-8 flex justify-between gap-4 border-t border-gray-300 pt-2.5 font-mono text-[9.5px] tracking-[0.06em] text-gray-600 uppercase">
        <span>Advivify · Monthly Performance Report</span><span>{r.name} · {r.month}</span>
      </div>
    </article>
  );
}

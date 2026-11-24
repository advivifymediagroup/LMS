// Daily HR milestones for the Finance team: interns nearing their end date and permanent
// staff nearing a work anniversary each get one Finance task and one email, created LEAD_DAYS
// ahead. Task.autoKey is unique, so re-runs (the job loop runs hourly) never duplicate anything.
import { Prisma, type User } from "@prisma/client";
import { db } from "./db";
import { renderEmail } from "./email";
import { fromIso, getSetting } from "./leave";
import { addDays, nextAnniversary, toIso, weekdayBefore } from "./leave-days";
import { sendMailSafe, type SmtpSettings } from "./mail";
import { appUrl } from "./notify";

const LEAD_DAYS = 14;
const MEETING = { start: "110000", end: "113000", label: "11:00–11:30" }; // company time

const pretty = (iso: string) => fromIso(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const team = (name: string) => db.user.findMany({ where: { isActive: true, department: { name } }, orderBy: { name: "asc" } });
const admins = () => db.user.findMany({ where: { isActive: true, role: "ADMIN" }, orderBy: { id: "asc" } });
const emails = (us: User[]) => us.map((u) => u.email).filter((e) => !e.endsWith(".invalid"));

/** Creates the task once; returns false if this milestone was already handled. */
async function createOnce(data: Prisma.TaskUncheckedCreateInput) {
  try {
    await db.task.create({ data });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

const icsText = (s: string) => s.replace(/[\;,]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
function invite(o: { uid: string; date: string; tz: string; title: string; description: string; organizer: string; attendees: User[] }) {
  const day = o.date.replaceAll("-", "");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Advivify//Portal//EN", "METHOD:REQUEST", "BEGIN:VEVENT",
    `UID:${o.uid}@portal.advivify`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`,
    `DTSTART;TZID=${o.tz}:${day}T${MEETING.start}`, `DTEND;TZID=${o.tz}:${day}T${MEETING.end}`,
    `SUMMARY:${icsText(o.title)}`, `DESCRIPTION:${icsText(o.description)}`,
    `ORGANIZER;CN=Advivify Portal:mailto:${o.organizer}`,
    ...o.attendees.filter((u) => !u.email.endsWith(".invalid")).map((u) => `ATTENDEE;CN=${icsText(u.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${u.email}`),
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
}

export async function runMilestones(today: string) {
  const [creator] = await admins();
  if (!creator) return 0;
  const [finance, leadership, financeDept, tz, smtp] = await Promise.all([
    team("Finance"), team("Leadership"), db.department.findUnique({ where: { name: "Finance" } }),
    getSetting("timezone", "Asia/Kolkata"), getSetting<SmtpSettings | null>("smtp", null),
  ]);
  const financeTo = finance.length ? finance : await admins(); // no Finance members yet → admins
  const leaders = leadership.length ? leadership : await admins();
  const people = await db.user.findMany({ where: { isActive: true }, include: { department: true } });
  let created = 0;

  for (const u of people) {
    const who = { name: u.name, sub: [u.employeeId, u.department?.name].filter(Boolean).join(" · ") };

    if (u.employmentType === "INTERN" && u.internshipEndDate) {
      const end = toIso(u.internshipEndDate);
      if (today < addDays(end, -LEAD_DAYS) || today > end) continue;
      const meet = weekdayBefore(end, 7, addDays(today, 1));
      const key = `intern-end:${u.id}:${end}`;
      const title = `Internship ending: ${u.name} (${u.employeeId})`;
      const desc = `${u.name}'s internship ends on ${pretty(end)}. A meeting with the leadership team is booked for ${pretty(meet)}, ${MEETING.label}, to discuss future opportunities. Prepare their internship summary and any offer or certificate paperwork.`;
      if (!(await createOnce({ autoKey: key, title, description: desc, kind: "Internship review", priority: "HIGH", dueDate: fromIso(end), departmentId: financeDept?.id, createdById: creator.id }))) continue;
      created++;
      await sendMailSafe({
        to: emails(financeTo),
        subject: `Internship ending ${pretty(end)}: ${u.name}`,
        text: `${desc}\n\nTask added to the Finance board: ${appUrl("/tasks")}`,
        html: renderEmail({
          preheader: `${u.name}'s internship ends on ${pretty(end)}. Leadership meeting booked for ${pretty(meet)}.`,
          eyebrow: "Finance task", title: "An internship is ending",
          intro: `${u.name}'s internship ends soon. A task has been added to the Finance board and a leadership meeting is already on the calendar.`,
          person: { ...who, pill: { text: "Intern", tone: "pending" } },
          rows: [["Internship ends", pretty(end)], ["Leadership meeting", `${pretty(meet)}, ${MEETING.label}`], ["Invited", [u.name, ...leaders.map((l) => l.name)].join(", ")]],
          buttons: [{ label: "Open Finance tasks", href: appUrl("/tasks"), primary: true }],
          footer: "You're receiving this because you're on the Finance team.",
        }),
      });
      const attendees = [u, ...leaders, ...financeTo].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i);
      const meetTitle = `Future opportunities: ${u.name} with Leadership`;
      const meetDesc = `${u.name}'s internship ends on ${pretty(end)}. Let's connect about future opportunities at Advivify.`;
      await sendMailSafe({
        to: emails(attendees),
        subject: `Invitation: ${meetTitle} (${pretty(meet)}, ${MEETING.label})`,
        text: meetDesc,
        ics: smtp?.user ? invite({ uid: key, date: meet, tz, title: meetTitle, description: meetDesc, organizer: smtp.user, attendees }) : undefined,
        html: renderEmail({
          preheader: `${pretty(meet)}, ${MEETING.label}. Use the invite to add it to your calendar.`,
          eyebrow: "Meeting invite", title: meetTitle, intro: meetDesc,
          person: who,
          rows: [["When", `${pretty(meet)}, ${MEETING.label}`], ["Who", attendees.map((a) => a.name).join(", ")]],
          footer: "You're receiving this because you're invited to this meeting.",
        }),
      });
    }

    if (u.employmentType === "PERMANENT") {
      const { date: ann, years } = nextAnniversary(toIso(u.joiningDate), today);
      if (today < addDays(ann, -LEAD_DAYS)) continue;
      const key = `appraisal:${u.id}:${ann}`;
      const title = `Appraisal due: ${u.name} (${years} year${years === 1 ? "" : "s"})`;
      const desc = `${u.name} completes ${years} year${years === 1 ? "" : "s"} at Advivify on ${pretty(ann)}. Prepare their appraisal.`;
      if (!(await createOnce({ autoKey: key, title, description: desc, kind: "Appraisal", priority: "MED", dueDate: fromIso(ann), departmentId: financeDept?.id, createdById: creator.id }))) continue;
      created++;
      await sendMailSafe({
        to: emails(financeTo),
        subject: `Appraisal due ${pretty(ann)}: ${u.name}`,
        text: `${desc}\n\nTask added to the Finance board: ${appUrl("/tasks")}`,
        html: renderEmail({
          preheader: desc, eyebrow: "Finance task", title: "An appraisal is coming up",
          intro: `${desc} A task has been added to the Finance board.`,
          person: { ...who, pill: { text: `${years} yr`, tone: "neutral" } },
          rows: [["Joined", pretty(toIso(u.joiningDate))], ["Anniversary", pretty(ann)]],
          buttons: [{ label: "Open Finance tasks", href: appUrl("/tasks"), primary: true }],
          footer: "You're receiving this because you're on the Finance team.",
        }),
      });
    }
  }
  return created;
}

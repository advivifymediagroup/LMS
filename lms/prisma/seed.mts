// Dev seed. Safe to re-run (existing rows are left alone). Run: npm run db:seed
// Leave types and holidays follow "AMG Leave Calendar and Policy 2026".
// Sample users and balances are fake.
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const DEV_PASSWORD = "Welcome@123"; // dev-only, documented in README

const d = (iso: string) => new Date(iso + "T00:00:00Z");

async function main() {
  for (const [key, value] of Object.entries({
    workingDays: [1, 2, 3, 4, 5],
    timezone: "Asia/Kolkata",
    probationMonths: 3,
    // Automatic credits start from this month; opening balances cover everything before it.
    creditsFrom: "2026-12",
    // Policy: every application is also sent to HR and Finance.
    notifyAlways: ["anuranjana@advivifymediagroup.com", "finance@advivifymediagroup.com"],
    // Dev: Mailpit from docker-compose catches all mail (http://localhost:8025).
    smtp: { host: "localhost", port: 1025, secure: false, user: "", pass: "", from: "Leave Management <lms@advivifymediagroup.com>" },
  })) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  const types = [
    {
      code: "CL", name: "Casual Leave", monthlyCredit: 1, maxCarryForward: null,
      noticeDays: 2, longLeaveDays: 2, longNoticeDays: 5,
      blockedOnProbation: true, blockedOnNotice: true, sandwichCounts: true,
    },
    { code: "SL", name: "Sick Leave", yearlyQuota: 8, maxCarryForward: 0, backdateDays: 7, certificateAfterDays: 3 },
    { code: "OL", name: "Optional Leave", yearlyQuota: 5, maxCarryForward: 0, noticeDays: 1, optionalHolidayOnly: true },
    { code: "LWP", name: "Leave Without Pay", needsBalance: false, sandwichCounts: true },
  ];
  // Every field spelled out, so re-seeding resets a type fully to policy.
  const defaults = {
    monthlyCredit: 0, yearlyQuota: 0, maxCarryForward: null as number | null, needsBalance: true, allowHalfDay: true,
    sandwichCounts: false, backdateDays: 0, noticeDays: 0, longLeaveDays: null as number | null, longNoticeDays: 0,
    blockedOnProbation: false, blockedOnNotice: false, certificateAfterDays: null as number | null, optionalHolidayOnly: false, isActive: true,
  };
  for (const t of types) {
    const data = { ...defaults, ...t };
    await db.leaveType.upsert({ where: { code: t.code }, update: data, create: data });
  }

  const fixed: [string, string][] = [
    ["2026-01-01", "New Year"],
    ["2026-01-26", "Republic Day"],
    ["2026-03-04", "Holi"],
    ["2026-05-01", "Labour Day / Buddha Purnima"],
    ["2026-08-15", "Independence Day"],
    ["2026-10-02", "Gandhi Jayanti"],
    ["2026-11-07", "Choti Diwali"],
    ["2026-11-08", "Diwali"],
    ["2026-12-25", "Christmas"],
  ];
  const optional: [string, string][] = [
    ["2026-01-14", "Makar Sankranti"],
    ["2026-01-23", "Basant Panchami"],
    ["2026-02-15", "Maha Shivratri"],
    ["2026-03-03", "Holika Dahan"],
    ["2026-03-19", "Eid ul-Fitr (tentative)"],
    ["2026-04-03", "Good Friday"],
    ["2026-05-27", "Bakra Eid"],
    ["2026-06-30", "Guru Purnima"],
    ["2026-07-15", "Muharram (tentative)"],
    ["2026-08-23", "Raksha Bandhan"],
    ["2026-09-04", "Janmashtami"],
    ["2026-09-14", "Ganesh Chaturthi"],
    ["2026-10-20", "Dussehra (Vijaya Dashami)"],
    ["2026-10-27", "Karva Chauth"],
    ["2026-11-09", "Bhai Dooj"],
    ["2026-11-18", "Chhath Puja"],
    ["2026-11-24", "Guru Nanak Jayanti"],
  ];
  for (const [list, isOptional] of [[fixed, false], [optional, true]] as const) {
    for (const [date, name] of list) {
      await db.holiday.upsert({ where: { date: d(date) }, update: { name, isOptional }, create: { date: d(date), name, isOptional } });
    }
  }

  const eng = await db.department.upsert({ where: { name: "Engineering" }, update: {}, create: { name: "Engineering" } });
  const sales = await db.department.upsert({ where: { name: "Sales" }, update: {}, create: { name: "Sales" } });

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const user = (employeeId: string, name: string, role: Role, departmentId: number | null, managerId: number | null, joined: string) =>
    db.user.upsert({
      where: { employeeId },
      update: {},
      create: {
        employeeId, name, role, departmentId, managerId, passwordHash,
        email: `${employeeId.toLowerCase()}@example.com`,
        joiningDate: d(joined),
        mustChangePassword: false,
      },
    });

  const admin = await user("ADM001", "Asha Admin", "ADMIN", null, null, "2023-01-02");
  const engLead = await user("LEAD001", "Ravi Engineering Lead", "LEAD", eng.id, admin.id, "2023-06-01");
  const salesLead = await user("LEAD002", "Meera Sales Lead", "LEAD", sales.id, admin.id, "2023-08-01");
  const staff = [
    await user("EMP001", "Karan Dev", "EMPLOYEE", eng.id, engLead.id, "2024-02-01"),
    await user("EMP002", "Neha Dev", "EMPLOYEE", eng.id, engLead.id, "2024-07-15"),
    await user("EMP003", "Arjun Dev", "EMPLOYEE", eng.id, engLead.id, "2025-01-10"),
    await user("EMP004", "Pooja Sales", "EMPLOYEE", sales.id, salesLead.id, "2025-03-03"),
    await user("EMP005", "Vikram Sales (on probation)", "EMPLOYEE", sales.id, salesLead.id, "2026-09-15"),
  ];

  // Opening balances as of launch. The probation joiner gets none: the monthly job credits them.
  const typeIds = Object.fromEntries((await db.leaveType.findMany()).map((t) => [t.code, t.id]));
  for (const u of [admin, engLead, salesLead, ...staff.slice(0, 4)]) {
    for (const [code, days] of [["CL", 6], ["SL", 4], ["OL", 3]] as const) {
      const key = { userId: u.id, leaveTypeId: typeIds[code], kind: "OPENING" as const, period: "opening" };
      await db.leaveLedger.upsert({
        where: { userId_leaveTypeId_kind_period: key },
        update: {},
        create: { ...key, days, note: "Seed balance" },
      });
    }
  }
  console.log("Seeded. Log in as ADM001 / LEAD001 / EMP001 with the dev password from the README.");
}

main().finally(() => db.$disconnect());

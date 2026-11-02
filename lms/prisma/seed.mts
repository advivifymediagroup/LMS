// Dev seed. Safe to re-run. Run: npm run db:seed
// Holidays and leave-type numbers are placeholders: replace with the real policy.
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
  })) {
    await db.setting.upsert({ where: { key }, update: {}, create: { key, value } });
  }

  const types = [
    { code: "CL", name: "Casual Leave", monthlyCredit: 1, maxCarryForward: 5, noticeDays: 3, sandwichCounts: true },
    { code: "SL", name: "Sick Leave", monthlyCredit: 0.5, backdateDays: 7 },
    { code: "OL", name: "Optional Leave", yearlyQuota: 5, noticeDays: 3, allowHalfDay: false, optionalHolidayOnly: true },
    { code: "LWP", name: "Leave Without Pay", needsBalance: false, noticeDays: 3, sandwichCounts: true },
  ];
  for (const t of types) await db.leaveType.upsert({ where: { code: t.code }, update: {}, create: t });

  const holidays = [
    ["2026-01-26", "Republic Day", false],
    ["2026-08-15", "Independence Day", false],
    ["2026-10-02", "Gandhi Jayanti", false],
    ["2026-11-24", "Guru Nanak Jayanti", true],
    ["2026-12-24", "Christmas Eve", true],
    ["2026-12-25", "Christmas", false],
    ["2027-01-14", "Makar Sankranti", true],
    ["2027-01-26", "Republic Day", false],
  ] as const;
  for (const [date, name, isOptional] of holidays) {
    await db.holiday.upsert({ where: { date: d(date) }, update: {}, create: { date: d(date), name, isOptional } });
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

  const typeIds = Object.fromEntries((await db.leaveType.findMany()).map((t) => [t.code, t.id]));
  for (const u of [admin, engLead, salesLead, ...staff]) {
    const rows = [
      { code: "CL", days: 6, kind: "OPENING" as const, period: "opening" },
      { code: "SL", days: 4, kind: "OPENING" as const, period: "opening" },
      { code: "OL", days: 5, kind: "YEARLY_CREDIT" as const, period: "2026" },
    ];
    for (const r of rows) {
      const key = { userId: u.id, leaveTypeId: typeIds[r.code], kind: r.kind, period: r.period };
      await db.leaveLedger.upsert({
        where: { userId_leaveTypeId_kind_period: key },
        update: {},
        create: { ...key, days: r.days, note: "Seed balance" },
      });
    }
  }
  console.log("Seeded. Log in as ADM001 / LEAD001 / EMP001 with the dev password from the README.");
}

main().finally(() => db.$disconnect());


import { PrismaClient, type Role } from "@prisma/client";

const prisma = new PrismaClient();

const prefixes: Record<Role, string> = {
  ADMIN: "ADM",
  LEAD: "LEAD",
  EMPLOYEE: "EMP",
};

async function main() {
  for (const role of ["ADMIN", "LEAD", "EMPLOYEE"] as const) {
    const prefix = prefixes[role];

    const users = await prisma.user.findMany({
      where: {
        employeeId: { startsWith: prefix },
      },
      select: {
        employeeId: true,
      },
    });

    const highest = users.reduce((max, user) => {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(
        user.employeeId
      );

      const number = match ? Number(match[1]) : 0;

      return Number.isSafeInteger(number)
        ? Math.max(max, number)
        : max;
    }, 0);

    await prisma.employeeIdCounter.upsert({
      where: { role },
      create: {
        role,
        lastNumber: highest,
      },
      update: {
        lastNumber: highest,
      },
    });

    console.log(`${role}: initialized at ${highest}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

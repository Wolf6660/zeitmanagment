import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { prisma } from "../src/db/prisma.js";

async function main() {
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "Musterfirma",
      systemName: "Zeitmanagment",
      defaultDailyHours: 8,
      selfCorrectionMaxDays: 3,
      autoBreakMinutes: 30,
      autoBreakAfterHours: 6,
      webPort: 3000,
      apiPort: 4000,
      terminalPort: 4010
    }
  });

  await prisma.dropdownOption.upsert({
    where: { category_label: { category: "CLOCK_REASON", label: "Web-Korrektur" } },
    update: {},
    create: { category: "CLOCK_REASON", label: "Web-Korrektur", isActive: true }
  });

  const adminPassword = await bcrypt.hash("Admin1234!", 12);
  const employeePassword = await bcrypt.hash("Mitarbeiter123!", 12);

  await prisma.user.upsert({
    where: { loginName: "admin" },
    update: {},
    create: {
      name: "System Admin",
      email: "admin@example.com",
      loginName: "admin",
      passwordHash: adminPassword,
      role: Role.ADMIN,
      annualVacationDays: 30,
      carryOverVacationDays: 0
    }
  });

  await prisma.user.upsert({
    where: { loginName: "max" },
    update: {},
    create: {
      name: "Max Muster",
      email: "max@example.com",
      loginName: "max",
      passwordHash: employeePassword,
      role: Role.EMPLOYEE,
      annualVacationDays: 30,
      carryOverVacationDays: 2
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

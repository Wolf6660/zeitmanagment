import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export async function ensureBootstrapData(): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      companyName: "Musterfirma",
      systemName: "Zeitmanagment",
      defaultDailyHours: 8,
      autoBreakMinutes: 30,
      autoBreakAfterHours: 6,
      webPort: 3000,
      apiPort: env.API_PORT,
      terminalPort: env.TERMINAL_PORT
    }
  });

  const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, 12);

  const adminByLogin = await prisma.user.findUnique({ where: { loginName: env.ADMIN_LOGIN_NAME } });
  if (adminByLogin) {
    await prisma.user.update({
      where: { id: adminByLogin.id },
      data: {
        name: env.ADMIN_NAME,
        email: env.ADMIN_EMAIL,
        loginName: env.ADMIN_LOGIN_NAME,
        passwordHash,
        role: Role.ADMIN,
        isActive: true
      }
    });
    return;
  }

  const anyAdmin = await prisma.user.findFirst({ where: { role: Role.ADMIN } });
  if (anyAdmin) {
    await prisma.user.update({
      where: { id: anyAdmin.id },
      data: {
        name: env.ADMIN_NAME,
        email: env.ADMIN_EMAIL,
        loginName: env.ADMIN_LOGIN_NAME,
        passwordHash,
        isActive: true
      }
    });
    return;
  }

  await prisma.user.create({
    data: {
      name: env.ADMIN_NAME,
      email: env.ADMIN_EMAIL,
      loginName: env.ADMIN_LOGIN_NAME,
      passwordHash,
      role: Role.ADMIN,
      annualVacationDays: 30,
      carryOverVacationDays: 0,
      isActive: true
    }
  });
}

import nodemailer from "nodemailer";
import { Role } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export async function sendMailIfEnabled(opts: { to: string; subject: string; text: string }): Promise<void> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.smtpEnabled || !cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPassword || !cfg.smtpFrom) {
    return;
  }

  const transport = nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: {
      user: cfg.smtpUser,
      pass: cfg.smtpPassword
    }
  });

  await transport.sendMail({
    from: cfg.smtpSenderName ? `"${cfg.smtpSenderName}" <${cfg.smtpFrom}>` : cfg.smtpFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text
  });
}

export type MailEventKey =
  | "mailOnEmployeeLeaveDecision"
  | "mailOnEmployeeOvertimeDecision"
  | "mailOnEmployeeLongShift"
  | "mailOnSupervisorLeaveRequest"
  | "mailOnSupervisorOvertimeRequest"
  | "mailOnSupervisorCrossMidnight"
  | "mailOnSupervisorUnknownRfid"
  | "mailOnAdminUnknownRfid"
  | "mailOnAdminSystemError";

export async function sendEventMail(eventKey: MailEventKey, opts: { to: string; subject: string; text: string }): Promise<void> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.smtpEnabled) return;
  if (!cfg[eventKey]) return;
  await sendMailIfEnabled(opts);
}

export async function getSupervisorEmails(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: { in: [Role.SUPERVISOR, Role.ADMIN] }, mailNotificationsEnabled: true },
    select: { email: true }
  });
  return rows.map((r) => r.email).filter(Boolean);
}

export async function getAdminEmails(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { isActive: true, role: Role.ADMIN, mailNotificationsEnabled: true },
    select: { email: true }
  });
  return rows.map((r) => r.email).filter(Boolean);
}

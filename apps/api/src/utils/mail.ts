import nodemailer from "nodemailer";
import { Role } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type MailConfig = {
  smtpEnabled: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpUser: string | null;
  smtpPassword: string | null;
  smtpFrom: string | null;
  smtpSenderName: string | null;
};

function assertMailConfig(cfg: MailConfig): asserts cfg is MailConfig & {
  smtpHost: string;
  smtpUser: string;
  smtpPassword: string;
  smtpFrom: string;
} {
  if (!cfg.smtpEnabled) throw new Error("SMTP ist deaktiviert.");
  if (!cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPassword || !cfg.smtpFrom) {
    throw new Error("SMTP Konfiguration ist unvollstaendig.");
  }
}

function buildTransport(cfg: MailConfig & { smtpHost: string; smtpUser: string; smtpPassword: string }) {
  return nodemailer.createTransport({
    host: cfg.smtpHost,
    port: cfg.smtpPort,
    secure: cfg.smtpPort === 465,
    auth: {
      user: cfg.smtpUser,
      pass: cfg.smtpPassword
    }
  });
}

export async function sendMailIfEnabled(opts: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; content: Buffer; contentType?: string }> }): Promise<void> {
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  if (!cfg?.smtpEnabled || !cfg.smtpHost || !cfg.smtpUser || !cfg.smtpPassword || !cfg.smtpFrom) {
    return;
  }

  const transport = buildTransport({
    ...cfg,
    smtpHost: cfg.smtpHost as string,
    smtpUser: cfg.smtpUser as string,
    smtpPassword: cfg.smtpPassword as string
  });

  await transport.sendMail({
    from: cfg.smtpSenderName ? `"${cfg.smtpSenderName}" <${cfg.smtpFrom}>` : cfg.smtpFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments
  });
}

export async function sendMailStrict(opts: { to: string; subject: string; text: string; html?: string; attachments?: Array<{ filename: string; content: Buffer; contentType?: string }> }): Promise<void> {
  const cfg = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: {
      smtpEnabled: true,
      smtpHost: true,
      smtpPort: true,
      smtpUser: true,
      smtpPassword: true,
      smtpFrom: true,
      smtpSenderName: true
    }
  });
  if (!cfg) throw new Error("Systemkonfiguration nicht gefunden.");
  assertMailConfig(cfg);
  const transport = buildTransport(cfg);
  await transport.sendMail({
    from: cfg.smtpSenderName ? `"${cfg.smtpSenderName}" <${cfg.smtpFrom}>` : cfg.smtpFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments
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

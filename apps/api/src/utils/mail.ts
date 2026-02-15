import nodemailer from "nodemailer";
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
    from: cfg.smtpFrom,
    to: opts.to,
    subject: opts.subject,
    text: opts.text
  });
}

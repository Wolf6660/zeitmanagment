import { Role } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";
import { sendMailIfEnabled } from "../../utils/mail.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole([Role.ADMIN]));

adminRouter.get("/config", async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  res.json(config);
});

const configSchema = z.object({
  companyName: z.string().min(1).optional(),
  systemName: z.string().min(1).optional(),
  companyLogoUrl: z.string().nullable().optional(),
  defaultDailyHours: z.number().min(1).max(24).optional(),
  defaultWeeklyWorkingDays: z.string().optional(),
  selfCorrectionMaxDays: z.number().int().min(0).max(60).optional(),
  autoBreakMinutes: z.number().int().min(0).max(180).optional(),
  autoBreakAfterHours: z.number().min(0).max(24).optional(),
  colorApproved: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorRejected: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorManualCorrection: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorBreakCredit: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorSickLeave: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorHolidayOrWeekendWork: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorVacationWarning: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  smtpEnabled: z.boolean().optional(),
  smtpHost: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpPassword: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpFrom: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable()).optional(),
  accountantMailEnabled: z.boolean().optional(),
  accountantEmail: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable()).optional(),
  webPort: z.number().int().min(1).max(65535).optional(),
  apiPort: z.number().int().min(1).max(65535).optional(),
  terminalPort: z.number().int().min(1).max(65535).optional()
});

adminRouter.patch("/config", async (req, res) => {
  const parsed = configSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  try {
    const updated = await prisma.systemConfig.update({
      where: { id: 1 },
      data: parsed.data
    });
    const authReq = req as AuthRequest;
    await writeAuditLog({
      actorUserId: authReq.auth?.userId,
      actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
      action: "SYSTEM_CONFIG_UPDATED",
      targetType: "SystemConfig",
      targetId: "1",
      payload: parsed.data
    });
    res.json(updated);
  } catch {
    res.status(400).json({ message: "Konfiguration konnte nicht gespeichert werden." });
  }
});

const holidaySchema = z.object({
  date: z.coerce.date(),
  name: z.string().min(1)
});

adminRouter.post("/holidays", async (req, res) => {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const holiday = await prisma.holiday.create({
    data: { date: parsed.data.date, name: parsed.data.name }
  });
  const authReq = req as AuthRequest;
  await writeAuditLog({
    actorUserId: authReq.auth?.userId,
    actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
    action: "HOLIDAY_CREATED",
    targetType: "Holiday",
    targetId: holiday.id,
    payload: parsed.data
  });

  res.status(201).json(holiday);
});

adminRouter.get("/holidays", async (_req, res) => {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  res.json(holidays);
});

const dropdownSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1)
});

adminRouter.post("/dropdown-options", async (req, res) => {
  const parsed = dropdownSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const option = await prisma.dropdownOption.create({ data: parsed.data });
  const authReq = req as AuthRequest;
  await writeAuditLog({
    actorUserId: authReq.auth?.userId,
    actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
    action: "DROPDOWN_OPTION_CREATED",
    targetType: "DropdownOption",
    targetId: option.id,
    payload: parsed.data
  });
  res.status(201).json(option);
});

adminRouter.get("/dropdown-options/:category", async (req, res) => {
  const category = String(req.params.category);
  const options = await prisma.dropdownOption.findMany({
    where: { category, isActive: true },
    orderBy: { label: "asc" }
  });
  res.json(options);
});

const sickSchema = z.object({
  userId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  partialDayHours: z.number().min(0).max(24).optional(),
  note: z.string().max(1000).optional()
});

adminRouter.post("/sick-leave", async (req: AuthRequest, res) => {
  const parsed = sickSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const sick = await prisma.sickLeave.create({
    data: {
      userId: parsed.data.userId,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      partialDayHours: parsed.data.partialDayHours,
      note: parsed.data.note,
      createdById: req.auth.userId
    },
    include: { user: { select: { name: true } } }
  });

  const config = await prisma.systemConfig.findUnique({ where: { id: 1 } });
  if (config?.accountantMailEnabled && config.accountantEmail) {
    await sendMailIfEnabled({
      to: config.accountantEmail,
      subject: `Krankmeldung: ${sick.user.name}`,
      text: `Krankheit eingetragen fuer ${sick.user.name} von ${sick.startDate.toISOString().slice(0, 10)} bis ${sick.endDate.toISOString().slice(0, 10)}.`
    });
  }
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "SICK_LEAVE_CREATED",
    targetType: "SickLeave",
    targetId: sick.id,
    payload: parsed.data
  });

  res.status(201).json(sick);
});

adminRouter.post("/year-end-rollover/:year", async (_req, res) => {
  const year = Number(_req.params.year);
  if (Number.isNaN(year)) {
    res.status(400).json({ message: "Ungueltiges Jahr." });
    return;
  }

  const users = await prisma.user.findMany({ where: { isActive: true } });
  const changes = [] as { userId: string; carryOverVacationDays: number }[];

  for (const user of users) {
    const approved = await prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        kind: "VACATION",
        status: "APPROVED",
        startDate: { gte: new Date(Date.UTC(year, 0, 1)) },
        endDate: { lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
      }
    });

    const usedDays = approved.reduce((acc, request) => {
      const days = Math.ceil((request.endDate.getTime() - request.startDate.getTime()) / 86400000) + 1;
      return acc + Math.max(days, 0);
    }, 0);

    const remaining = Math.max(user.carryOverVacationDays + user.annualVacationDays - usedDays, 0);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        carryOverVacationDays: remaining
      }
    });

    changes.push({ userId: updated.id, carryOverVacationDays: updated.carryOverVacationDays });
  }

  res.json({ year, processedUsers: changes.length, changes });
});

const createTerminalSchema = z.object({
  name: z.string().min(1),
  location: z.string().max(255).optional()
});

adminRouter.post("/terminals", async (req, res) => {
  const parsed = createTerminalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const terminal = await prisma.rfidTerminal.create({
    data: {
      name: parsed.data.name,
      location: parsed.data.location,
      apiKey: crypto.randomBytes(24).toString("hex")
    }
  });
  const authReq = req as AuthRequest;
  await writeAuditLog({
    actorUserId: authReq.auth?.userId,
    actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
    action: "RFID_TERMINAL_CREATED",
    targetType: "RfidTerminal",
    targetId: terminal.id,
    payload: parsed.data
  });

  res.status(201).json(terminal);
});

adminRouter.get("/terminals", async (_req, res) => {
  const terminals = await prisma.rfidTerminal.findMany({
    orderBy: { createdAt: "desc" }
  });
  res.json(terminals);
});

const updateTerminalSchema = z.object({
  name: z.string().min(1).optional(),
  location: z.string().max(255).nullable().optional(),
  isActive: z.boolean().optional()
});

adminRouter.patch("/terminals/:id", async (req, res) => {
  const parsed = updateTerminalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const terminalId = String(req.params.id);
  const updated = await prisma.rfidTerminal.update({
    where: { id: terminalId },
    data: parsed.data
  });
  const authReq = req as AuthRequest;
  await writeAuditLog({
    actorUserId: authReq.auth?.userId,
    actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
    action: "RFID_TERMINAL_UPDATED",
    targetType: "RfidTerminal",
    targetId: updated.id,
    payload: parsed.data
  });
  res.json(updated);
});

adminRouter.post("/terminals/:id/regenerate-key", async (req, res) => {
  const terminalId = String(req.params.id);
  const updated = await prisma.rfidTerminal.update({
    where: { id: terminalId },
    data: { apiKey: crypto.randomBytes(24).toString("hex") }
  });
  const authReq = req as AuthRequest;
  await writeAuditLog({
    actorUserId: authReq.auth?.userId,
    actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
    action: "RFID_TERMINAL_KEY_REGENERATED",
    targetType: "RfidTerminal",
    targetId: updated.id
  });
  res.json(updated);
});

adminRouter.get("/audit-logs", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 300
  });
  res.json(logs);
});

const logoUploadSchema = z.object({
  filename: z.string().min(3),
  contentBase64: z.string().min(10)
});

adminRouter.post("/logo-upload", async (req: AuthRequest, res) => {
  const parsed = logoUploadSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const ext = parsed.data.filename.toLowerCase().endsWith(".png")
    ? "png"
    : parsed.data.filename.toLowerCase().endsWith(".jpg") || parsed.data.filename.toLowerCase().endsWith(".jpeg")
      ? "jpg"
      : null;
  if (!ext) {
    res.status(400).json({ message: "Nur PNG/JPG erlaubt." });
    return;
  }
  const uploadDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
  const targetPath = path.join(uploadDir, `logo.${ext}`);
  const rawBase64 = parsed.data.contentBase64.includes(",")
    ? parsed.data.contentBase64.split(",").pop() || ""
    : parsed.data.contentBase64;
  fs.writeFileSync(targetPath, Buffer.from(rawBase64, "base64"));
  const logoUrl = `/uploads/logo.${ext}`;
  await prisma.systemConfig.update({ where: { id: 1 }, data: { companyLogoUrl: logoUrl } });
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "LOGO_UPLOADED",
    targetType: "SystemConfig",
    targetId: "1",
    payload: { logoUrl }
  });
  res.json({ logoUrl });
});

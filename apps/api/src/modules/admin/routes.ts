import { Role } from "@prisma/client";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";
import { sendMailIfEnabled, sendMailStrict } from "../../utils/mail.js";
import { ensureBootstrapData } from "../../db/bootstrap.js";
import { env } from "../../config/env.js";
import { buildBackupPayload, type BackupMode } from "../../utils/backup.js";

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
  mobileAppApiBaseUrl: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  defaultDailyHours: z.number().min(1).max(24).optional(),
  defaultWeeklyWorkingDays: z.string().optional(),
  selfCorrectionMaxDays: z.number().int().min(0).max(60).optional(),
  autoBreakMinutes: z.number().int().min(0).max(180).optional(),
  autoBreakAfterHours: z.number().min(0).max(24).optional(),
  timeRoundingEnabled: z.boolean().optional(),
  timeRoundingMinutes: z.number().int().refine((v) => [5, 10, 15].includes(v), "Nur 5, 10 oder 15 Minuten erlaubt.").optional(),
  timeRoundingMode: z.enum(["NEAREST", "UP"]).optional(),
  requireApprovalForCrossMidnight: z.boolean().optional(),
  requireReasonWebClock: z.boolean().optional(),
  requireNoteSelfCorrection: z.boolean().optional(),
  requireNoteSupervisorCorrection: z.boolean().optional(),
  requireNoteLeaveRequest: z.boolean().optional(),
  requireNoteLeaveDecision: z.boolean().optional(),
  requireNoteLeaveSupervisorUpdate: z.boolean().optional(),
  requireNoteOvertimeAdjustment: z.boolean().optional(),
  requireNoteOvertimeAccountSet: z.boolean().optional(),
  requireOtherSupervisorForBreakCreditApproval: z.boolean().optional(),
  colorApproved: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorRejected: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorManualCorrection: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorBulkEntry: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorBreakCredit: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorSickLeave: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorHolidayOrWeekend: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorHolidayOrWeekendWork: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorVacationWarning: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorWebEntry: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorOvertime: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavMainActive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavMainInactive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavSubActive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavSubInactive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavTextActive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavTextInactive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavSubTextActive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorNavSubTextInactive: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonClockIn: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonClockOut: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonManual: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonClockInText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonClockOutText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorButtonManualText: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  colorApprovedEnabled: z.boolean().optional(),
  colorRejectedEnabled: z.boolean().optional(),
  colorManualCorrectionEnabled: z.boolean().optional(),
  colorBulkEntryEnabled: z.boolean().optional(),
  colorBreakCreditEnabled: z.boolean().optional(),
  colorSickLeaveEnabled: z.boolean().optional(),
  colorHolidayOrWeekendEnabled: z.boolean().optional(),
  colorHolidayOrWeekendWorkEnabled: z.boolean().optional(),
  colorVacationWarningEnabled: z.boolean().optional(),
  colorWebEntryEnabled: z.boolean().optional(),
  colorOvertimeEnabled: z.boolean().optional(),
  colorNavMainActiveEnabled: z.boolean().optional(),
  colorNavMainInactiveEnabled: z.boolean().optional(),
  colorNavSubActiveEnabled: z.boolean().optional(),
  colorNavSubInactiveEnabled: z.boolean().optional(),
  colorNavTextActiveEnabled: z.boolean().optional(),
  colorNavTextInactiveEnabled: z.boolean().optional(),
  colorNavSubTextActiveEnabled: z.boolean().optional(),
  colorNavSubTextInactiveEnabled: z.boolean().optional(),
  colorButtonClockInEnabled: z.boolean().optional(),
  colorButtonClockOutEnabled: z.boolean().optional(),
  colorButtonManualEnabled: z.boolean().optional(),
  colorButtonClockInTextEnabled: z.boolean().optional(),
  colorButtonClockOutTextEnabled: z.boolean().optional(),
  colorButtonManualTextEnabled: z.boolean().optional(),
  smtpEnabled: z.boolean().optional(),
  smtpHost: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpPort: z.number().int().min(1).max(65535).optional(),
  smtpUser: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpPassword: z.preprocess((v) => (v === "" ? null : v), z.string().nullable()).optional(),
  smtpFrom: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable()).optional(),
  smtpSenderName: z.preprocess((v) => (v === "" ? null : v), z.string().max(120).nullable()).optional(),
  mailOnEmployeeLeaveDecision: z.boolean().optional(),
  mailOnEmployeeOvertimeDecision: z.boolean().optional(),
  mailOnEmployeeLongShift: z.boolean().optional(),
  mailOnSupervisorLeaveRequest: z.boolean().optional(),
  mailOnSupervisorOvertimeRequest: z.boolean().optional(),
  mailOnSupervisorCrossMidnight: z.boolean().optional(),
  mailOnSupervisorUnknownRfid: z.boolean().optional(),
  mailOnAdminUnknownRfid: z.boolean().optional(),
  mailOnAdminSystemError: z.boolean().optional(),
  accountantMailEnabled: z.boolean().optional(),
  accountantMailOnSick: z.boolean().optional(),
  accountantMailOnVacation: z.boolean().optional(),
  accountantEmail: z.preprocess((v) => (v === "" ? null : v), z.string().email().nullable()).optional(),
  autoBackupEnabled: z.boolean().optional(),
  autoBackupDays: z.string().optional(),
  autoBackupTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/).optional(),
  autoBackupMode: z.enum(["FULL", "SETTINGS_ONLY", "EMPLOYEES_TIMES_ONLY"]).optional(),
  autoBackupDirectory: z.string().min(1).optional(),
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
    try {
      await writeAuditLog({
        actorUserId: authReq.auth?.userId,
        actorLoginName: await resolveActorLoginName(authReq.auth?.userId),
        action: "SYSTEM_CONFIG_UPDATED",
        targetType: "SystemConfig",
        targetId: "1",
        payload: parsed.data
      });
    } catch {
      // Konfiguration wurde gespeichert; Log-Fehler darf kein 400 ausloesen.
    }
    res.json(updated);
  } catch {
    res.status(400).json({ message: "Konfiguration konnte nicht gespeichert werden." });
  }
});

adminRouter.post("/mail/test-sender", async (req: AuthRequest, res) => {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: 1 },
      select: { smtpFrom: true }
    });
    if (!cfg?.smtpFrom) {
      res.status(400).json({ message: "Absenderadresse ist nicht gesetzt." });
      return;
    }
    await sendMailStrict({
      to: cfg.smtpFrom,
      subject: "SMTP Testmail (Absender)",
      text: `Dies ist eine Testmail vom System Zeitmanagment.\nZeit: ${new Date().toISOString()}`
    });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "MAIL_TEST_SENDER_SENT",
      targetType: "SystemConfig",
      targetId: "1"
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: (e as Error).message || "SMTP Test fehlgeschlagen." });
  }
});

adminRouter.post("/mail/test-accountant", async (req: AuthRequest, res) => {
  try {
    const cfg = await prisma.systemConfig.findUnique({
      where: { id: 1 },
      select: { accountantEmail: true }
    });
    if (!cfg?.accountantEmail) {
      res.status(400).json({ message: "Buchhalter E-Mail ist nicht gesetzt." });
      return;
    }
    await sendMailStrict({
      to: cfg.accountantEmail,
      subject: "Testmail Buchhaltung",
      text: `Dies ist eine Testmail an die Buchhaltung.\nZeit: ${new Date().toISOString()}`
    });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "MAIL_TEST_ACCOUNTANT_SENT",
      targetType: "SystemConfig",
      targetId: "1"
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: (e as Error).message || "Buchhalter-Testmail fehlgeschlagen." });
  }
});

const testEmployeeMailSchema = z.object({
  userId: z.string().min(1)
});

adminRouter.post("/mail/test-employee", async (req: AuthRequest, res) => {
  const parsed = testEmployeeMailSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, name: true, email: true, loginName: true }
    });
    if (!user) {
      res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
      return;
    }
    await sendMailStrict({
      to: user.email,
      subject: "Testmail Mitarbeiter",
      text: `Hallo ${user.name},\ndies ist eine Testmail fuer ${user.loginName}.\nZeit: ${new Date().toISOString()}`
    });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "MAIL_TEST_EMPLOYEE_SENT",
      targetType: "User",
      targetId: user.id
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ message: (e as Error).message || "Mitarbeiter-Testmail fehlgeschlagen." });
  }
});

const resetSchema = z.object({
  mode: z.enum(["FULL", "TIMES_ONLY", "EMPLOYEES_AND_TIMES_KEEP_SETTINGS"]),
  companyNameConfirmation: z.string().min(1)
});

adminRouter.post("/system-reset", async (req: AuthRequest, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { companyName: true } });
  const expected = (cfg?.companyName || "").trim();
  if (!expected || parsed.data.companyNameConfirmation.trim() !== expected) {
    res.status(400).json({ message: "Bestaetigung fehlgeschlagen: Firmenname stimmt nicht ueberein." });
    return;
  }

  const mode = parsed.data.mode;
  const deleted: Record<string, number> = {};

  const addCount = (key: string, value: { count: number }) => {
    deleted[key] = value.count;
  };

  if (mode === "TIMES_ONLY") {
    await prisma.$transaction(async (tx) => {
      addCount("breakCredits", await tx.breakCredit.deleteMany({}));
      addCount("breakCreditRequests", await tx.breakCreditRequest.deleteMany({}));
      addCount("specialWorkApprovals", await tx.specialWorkApproval.deleteMany({}));
      addCount("timeEntries", await tx.timeEntry.deleteMany({}));
      addCount("sickLeaves", await tx.sickLeave.deleteMany({}));
      addCount("leaveRequests", await tx.leaveRequest.deleteMany({}));
      addCount("overtimeAdjustments", await tx.overtimeAdjustment.deleteMany({}));
      addCount("vacationBalances", await tx.vacationBalance.deleteMany({}));
    });
  } else if (mode === "EMPLOYEES_AND_TIMES_KEEP_SETTINGS") {
    await prisma.$transaction(async (tx) => {
      addCount("breakCredits", await tx.breakCredit.deleteMany({}));
      addCount("breakCreditRequests", await tx.breakCreditRequest.deleteMany({}));
      addCount("specialWorkApprovals", await tx.specialWorkApproval.deleteMany({}));
      addCount("timeEntries", await tx.timeEntry.deleteMany({}));
      addCount("sickLeaves", await tx.sickLeave.deleteMany({}));
      addCount("leaveRequests", await tx.leaveRequest.deleteMany({}));
      addCount("overtimeAdjustments", await tx.overtimeAdjustment.deleteMany({}));
      addCount("vacationBalances", await tx.vacationBalance.deleteMany({}));
      addCount("users", await tx.user.deleteMany({ where: { loginName: { not: env.ADMIN_LOGIN_NAME } } }));
    });
    await ensureBootstrapData();
  } else {
    await prisma.$transaction(async (tx) => {
      addCount("breakCredits", await tx.breakCredit.deleteMany({}));
      addCount("breakCreditRequests", await tx.breakCreditRequest.deleteMany({}));
      addCount("specialWorkApprovals", await tx.specialWorkApproval.deleteMany({}));
      addCount("timeEntries", await tx.timeEntry.deleteMany({}));
      addCount("sickLeaves", await tx.sickLeave.deleteMany({}));
      addCount("leaveRequests", await tx.leaveRequest.deleteMany({}));
      addCount("overtimeAdjustments", await tx.overtimeAdjustment.deleteMany({}));
      addCount("vacationBalances", await tx.vacationBalance.deleteMany({}));
      addCount("dropdownOptions", await tx.dropdownOption.deleteMany({}));
      addCount("holidays", await tx.holiday.deleteMany({}));
      addCount("rfidTerminals", await tx.rfidTerminal.deleteMany({}));
      addCount("auditLogs", await tx.auditLog.deleteMany({}));
      addCount("users", await tx.user.deleteMany({}));
      addCount("systemConfig", await tx.systemConfig.deleteMany({}));
    });
    await ensureBootstrapData();
  }

  try {
    await writeAuditLog({
      actorUserId: mode === "FULL" ? undefined : req.auth.userId,
      actorLoginName: mode === "FULL" ? "system-reset" : await resolveActorLoginName(req.auth.userId),
      action: "SYSTEM_RESET",
      targetType: "System",
      targetId: mode,
      payload: { mode, deleted }
    });
  } catch {
    // Reset ist bereits erfolgreich; Log-Fehler darf keinen 5xx mehr erzeugen.
  }

  res.json({ ok: true, mode, deleted });
});

adminRouter.get("/backup/export", async (req: AuthRequest, res) => {
  const modeRaw = String(req.query.mode || "FULL").toUpperCase();
  const mode: BackupMode = modeRaw === "SETTINGS_ONLY" || modeRaw === "EMPLOYEES_TIMES_ONLY" ? modeRaw : "FULL";
  const payload = await buildBackupPayload(mode);
  res.json(payload);
});

const backupImportSchema = z.object({
  companyNameConfirmation: z.string().min(1),
  backup: z.record(z.any())
});

function normalizeRowDates(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && (key.endsWith("At") || key.toLowerCase().endsWith("date"))) {
      out[key] = new Date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

adminRouter.post("/backup/import", async (req: AuthRequest, res) => {
  const parsed = backupImportSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { companyName: true } });
  const expected = (cfg?.companyName || "").trim();
  if (!expected || parsed.data.companyNameConfirmation.trim() !== expected) {
    res.status(400).json({ message: "Bestaetigung fehlgeschlagen: Firmenname stimmt nicht ueberein." });
    return;
  }

  const backup = parsed.data.backup as { data?: Record<string, unknown> };
  const data = backup.data;
  if (!data || typeof data !== "object") {
    res.status(400).json({ message: "Backup-Format ungueltig (data fehlt)." });
    return;
  }

  const toRows = (key: string): Array<Record<string, unknown>> => {
    const v = data[key];
    if (!v) return [];
    if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object") as Array<Record<string, unknown>>;
    if (typeof v === "object") return [v as Record<string, unknown>];
    return [];
  };

  const rowsConfig = toRows("config");
  const rowsUsers = toRows("users");
  const rowsHolidays = toRows("holidays");
  const rowsDropdown = toRows("dropdownOptions");
  const rowsTerminals = toRows("terminals");
  const rowsTimeEntries = toRows("timeEntries");
  const rowsLeaveRequests = toRows("leaveRequests");
  const rowsSickLeaves = toRows("sickLeaves");
  const rowsBreakCredits = toRows("breakCredits");
  const rowsBreakCreditRequests = toRows("breakCreditRequests");
  const rowsSpecialApprovals = toRows("specialWorkApprovals");
  const rowsOvertimeAdjustments = toRows("overtimeAdjustments");

  const importKeys = [
    rowsConfig.length ? "config" : "",
    rowsUsers.length ? "users" : "",
    rowsHolidays.length ? "holidays" : "",
    rowsDropdown.length ? "dropdownOptions" : "",
    rowsTerminals.length ? "terminals" : "",
    rowsTimeEntries.length ? "timeEntries" : "",
    rowsLeaveRequests.length ? "leaveRequests" : "",
    rowsSickLeaves.length ? "sickLeaves" : "",
    rowsBreakCredits.length ? "breakCredits" : "",
    rowsBreakCreditRequests.length ? "breakCreditRequests" : "",
    rowsSpecialApprovals.length ? "specialWorkApprovals" : "",
    rowsOvertimeAdjustments.length ? "overtimeAdjustments" : ""
  ].filter(Boolean);

  if (importKeys.length === 0) {
    res.status(400).json({ message: "Backup enthaelt keine importierbaren Daten." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    // Delete existing data for all provided categories.
    if (
      rowsUsers.length ||
      rowsTimeEntries.length ||
      rowsLeaveRequests.length ||
      rowsSickLeaves.length ||
      rowsBreakCredits.length ||
      rowsBreakCreditRequests.length ||
      rowsSpecialApprovals.length ||
      rowsOvertimeAdjustments.length
    ) {
      await tx.breakCredit.deleteMany({});
      await tx.breakCreditRequest.deleteMany({});
      await tx.specialWorkApproval.deleteMany({});
      await tx.timeEntry.deleteMany({});
      await tx.sickLeave.deleteMany({});
      await tx.leaveRequest.deleteMany({});
      await tx.overtimeAdjustment.deleteMany({});
      await tx.vacationBalance.deleteMany({});
    }
    if (rowsUsers.length) {
      await tx.user.deleteMany({});
    }
    if (rowsDropdown.length) {
      await tx.dropdownOption.deleteMany({});
    }
    if (rowsHolidays.length) {
      await tx.holiday.deleteMany({});
    }
    if (rowsTerminals.length) {
      await tx.rfidTerminal.deleteMany({});
    }
    if (rowsConfig.length) {
      await tx.systemConfig.deleteMany({});
    }

    // Reinsert in FK-safe order.
    if (rowsConfig.length) {
      await tx.systemConfig.createMany({ data: rowsConfig.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsUsers.length) {
      await tx.user.createMany({ data: rowsUsers.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsHolidays.length) {
      await tx.holiday.createMany({ data: rowsHolidays.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsDropdown.length) {
      await tx.dropdownOption.createMany({ data: rowsDropdown.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsTerminals.length) {
      await tx.rfidTerminal.createMany({ data: rowsTerminals.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsTimeEntries.length) {
      await tx.timeEntry.createMany({ data: rowsTimeEntries.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsLeaveRequests.length) {
      await tx.leaveRequest.createMany({ data: rowsLeaveRequests.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsSickLeaves.length) {
      await tx.sickLeave.createMany({ data: rowsSickLeaves.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsBreakCredits.length) {
      await tx.breakCredit.createMany({ data: rowsBreakCredits.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsBreakCreditRequests.length) {
      await tx.breakCreditRequest.createMany({ data: rowsBreakCreditRequests.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsSpecialApprovals.length) {
      await tx.specialWorkApproval.createMany({ data: rowsSpecialApprovals.map((r) => normalizeRowDates(r)) as any[] });
    }
    if (rowsOvertimeAdjustments.length) {
      await tx.overtimeAdjustment.createMany({ data: rowsOvertimeAdjustments.map((r) => normalizeRowDates(r)) as any[] });
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "BACKUP_IMPORTED",
    targetType: "System",
    targetId: "backup",
    payload: { imported: importKeys }
  });

  res.json({ ok: true, imported: importKeys });
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
  if (config?.accountantMailEnabled && config.accountantMailOnSick && config.accountantEmail) {
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
  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59))
      }
    }
  });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
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
      const days = [];
      const start = new Date(Date.UTC(request.startDate.getUTCFullYear(), request.startDate.getUTCMonth(), request.startDate.getUTCDate()));
      const end = new Date(Date.UTC(request.endDate.getUTCFullYear(), request.endDate.getUTCMonth(), request.endDate.getUTCDate()));
      for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) {
        const key = d.toISOString().slice(0, 10);
        const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
        if (!weekend && !holidaySet.has(key)) days.push(key);
      }
      return acc + days.length;
    }, 0);

    // Plus-/Minusurlaub wird unveraendert ins Folgejahr uebertragen.
    const remaining = user.carryOverVacationDays + user.annualVacationDays - usedDays;

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

adminRouter.get("/rfid/unassigned", async (_req, res) => {
  const assignedUsers = await prisma.user.findMany({
    where: { rfidTag: { not: null } },
    select: { rfidTag: true }
  });
  const assignedTags = new Set(
    assignedUsers.map((u) => (u.rfidTag || "").trim().toUpperCase()).filter((t) => t.length > 0)
  );

  const dismissedLogs = await prisma.auditLog.findMany({
    where: { action: "RFID_UNASSIGNED_DELETED" },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  const dismissedTags = new Map<string, Date>();
  for (const log of dismissedLogs) {
    if (!log.payloadJson) continue;
    try {
      const payload = JSON.parse(log.payloadJson) as Record<string, unknown>;
      const tag = String(payload.rfidTag || "").trim().toUpperCase();
      if (!tag) continue;
      const existing = dismissedTags.get(tag);
      if (!existing || log.createdAt > existing) {
        dismissedTags.set(tag, log.createdAt);
      }
    } catch {
      // ignore invalid payload
    }
  }

  const logs = await prisma.auditLog.findMany({
    where: { action: "RFID_UNASSIGNED_SCAN" },
    orderBy: { createdAt: "desc" },
    take: 300
  });

  const byTag = new Map<string, {
    rfidTag: string;
    seenCount: number;
    lastSeenAt: string;
    terminalId?: string;
    terminalName?: string;
    lastType?: string;
    lastReasonText?: string | null;
  }>();

  for (const log of logs) {
    let payload: Record<string, unknown> = {};
    if (log.payloadJson) {
      try {
        payload = JSON.parse(log.payloadJson) as Record<string, unknown>;
      } catch {
        payload = {};
      }
    }
    const tag = String(payload.rfidTag || "").trim();
    if (!tag) continue;
    const normalizedTag = tag.toUpperCase();
    if (assignedTags.has(normalizedTag)) continue;
    const dismissedAt = dismissedTags.get(normalizedTag);
    if (dismissedAt && log.createdAt <= dismissedAt) continue;

    const existing = byTag.get(normalizedTag);
    if (existing) {
      existing.seenCount += 1;
      continue;
    }
    byTag.set(normalizedTag, {
      rfidTag: tag,
      seenCount: 1,
      lastSeenAt: log.createdAt.toISOString(),
      terminalId: typeof payload.terminalId === "string" ? payload.terminalId : undefined,
      terminalName: typeof payload.terminalName === "string" ? payload.terminalName : undefined,
      lastType: typeof payload.type === "string" ? payload.type : undefined,
      lastReasonText: typeof payload.reasonText === "string" || payload.reasonText === null ? (payload.reasonText as string | null) : null
    });
  }

  res.json(Array.from(byTag.values()));
});

const deleteUnassignedRfidSchema = z.object({
  rfidTag: z.string().trim().min(1)
});

adminRouter.post("/rfid/unassigned/delete", async (req: AuthRequest, res) => {
  const parsed = deleteUnassignedRfidSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const cleanedTag = parsed.data.rfidTag.trim().toUpperCase();
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "RFID_UNASSIGNED_DELETED",
    targetType: "RfidTag",
    targetId: cleanedTag,
    payload: { rfidTag: cleanedTag }
  });

  res.json({ ok: true });
});

const assignRfidSchema = z.object({
  userId: z.string().min(1),
  rfidTag: z.string().trim().min(1),
  note: z.string().trim().max(500).optional()
});

adminRouter.post("/rfid/assign", async (req: AuthRequest, res) => {
  const parsed = assignRfidSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, loginName: true, rfidTag: true, rfidTagActive: true }
  });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { rfidTag: parsed.data.rfidTag, NOT: { id: parsed.data.userId } },
    select: { id: true, name: true, loginName: true }
  });
  if (existing) {
    res.status(409).json({ message: `RFID ist bereits zugewiesen (${existing.name}/${existing.loginName}).` });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: { rfidTag: parsed.data.rfidTag, rfidTagActive: true },
    select: { id: true, name: true, loginName: true, rfidTag: true, rfidTagActive: true }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "RFID_ASSIGNED",
    targetType: "User",
    targetId: updated.id,
    payload: {
      oldRfidTag: user.rfidTag,
      newRfidTag: updated.rfidTag,
      note: parsed.data.note || null
    }
  });

  res.json(updated);
});

const unassignRfidSchema = z.object({
  userId: z.string().min(1),
  mode: z.enum(["DEACTIVATE", "DELETE"]).default("DEACTIVATE")
});

adminRouter.post("/rfid/unassign", async (req: AuthRequest, res) => {
  const parsed = unassignRfidSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, loginName: true, rfidTag: true, rfidTagActive: true }
  });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (!user.rfidTag) {
    res.status(400).json({ message: "Mitarbeiter hat keinen RFID Tag." });
    return;
  }

  const updated = await prisma.user.update({
    where: { id: parsed.data.userId },
    data: parsed.data.mode === "DELETE" ? { rfidTag: null, rfidTagActive: true } : { rfidTagActive: false },
    select: { id: true, name: true, loginName: true, rfidTag: true, rfidTagActive: true }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: parsed.data.mode === "DELETE" ? "RFID_DELETED" : "RFID_DEACTIVATED",
    targetType: "User",
    targetId: updated.id,
    payload: { oldRfidTag: user.rfidTag, mode: parsed.data.mode }
  });

  res.json(updated);
});

const espProvisionSchema = z.object({
  terminalId: z.string().min(1),
  wifiSsid: z.string().min(1),
  wifiPassword: z.string().min(1),
  serverHost: z.string().min(1),
  serverPort: z.number().int().min(1).max(65535),
  useTls: z.boolean(),
  displayEnabled: z.boolean(),
  displayRows: z.number().int().min(1).max(8),
  displayPins: z.object({
    sda: z.number().int().min(0).max(39).optional(),
    scl: z.number().int().min(0).max(39).optional(),
    address: z.string().regex(/^0x[0-9A-Fa-f]{2}$/).optional()
  }).optional(),
  readerType: z.enum(["RC522", "PN532"]),
  pn532Mode: z.enum(["I2C", "SPI"]).optional(),
  pins: z.object({
    sda: z.number().int().min(0).max(39).optional(),
    scl: z.number().int().min(0).max(39).optional(),
    mosi: z.number().int().min(0).max(39).optional(),
    miso: z.number().int().min(0).max(39).optional(),
    sck: z.number().int().min(0).max(39).optional(),
    ss: z.number().int().min(0).max(39).optional(),
    rst: z.number().int().min(0).max(39).optional(),
    irq: z.number().int().min(0).max(39).optional()
  })
});

adminRouter.post("/esp/provision-config", async (req: AuthRequest, res) => {
  const parsed = espProvisionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const terminal = await prisma.rfidTerminal.findUnique({
    where: { id: parsed.data.terminalId },
    select: { id: true, name: true, apiKey: true, isActive: true }
  });
  const sys = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: { companyName: true, systemName: true }
  });
  if (!terminal) {
    res.status(404).json({ message: "Terminal nicht gefunden." });
    return;
  }

  const endpoint = `${parsed.data.useTls ? "https" : "http"}://${parsed.data.serverHost}:${parsed.data.serverPort}/api/terminal/punch`;
  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    terminal: {
      id: terminal.id,
      name: terminal.name,
      key: terminal.apiKey,
      active: terminal.isActive
    },
    network: {
      wifiSsid: parsed.data.wifiSsid,
      wifiPassword: parsed.data.wifiPassword
    },
    server: {
      endpoint,
      host: parsed.data.serverHost,
      port: parsed.data.serverPort,
      useTls: parsed.data.useTls
    },
    hardware: {
      readerType: parsed.data.readerType,
      pn532Mode: parsed.data.readerType === "PN532" ? (parsed.data.pn532Mode || "I2C") : undefined,
      pins: parsed.data.pins,
      display: {
        enabled: parsed.data.displayEnabled,
        rows: parsed.data.displayRows,
        pins: {
          sda: parsed.data.displayPins?.sda ?? 21,
          scl: parsed.data.displayPins?.scl ?? 22,
          address: parsed.data.displayPins?.address ?? "0x27"
        }
      }
    },
    displayBehaviour: {
      idleLine1: sys?.companyName || "Firmenname",
      idleLine2: "Datum + Uhrzeit",
      onScan: "Name + Kommen/Gehen + Uhrzeit",
      onClockOut: "zusaetzlich Tagesarbeitszeit (aufsummiert)"
    },
    timezone: "CET-1CEST,M3.5.0/2,M10.5.0/3",
    ntpServer: "pool.ntp.org",
    timeOffsetHours: 0
  };

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "ESP_PROVISION_CONFIG_GENERATED",
    targetType: "RfidTerminal",
    targetId: terminal.id,
    payload: {
      terminalId: terminal.id,
      readerType: parsed.data.readerType,
      displayEnabled: parsed.data.displayEnabled,
      displayRows: parsed.data.displayRows,
      serverHost: parsed.data.serverHost,
      serverPort: parsed.data.serverPort
    }
  });

  res.json(payload);
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

const mobileQrGenerateSchema = z.object({
  userId: z.string().min(1)
});

const mobileQrRevokeSchema = z.object({
  userId: z.string().min(1)
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
  const uploadDir = path.resolve(env.UPLOAD_DIR);
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

adminRouter.post("/mobile-qr/generate", async (req: AuthRequest, res) => {
  const parsed = mobileQrGenerateSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, name: true, loginName: true, role: true, isActive: true, webLoginEnabled: true }
  });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (!user.isActive) {
    res.status(400).json({ message: "Mitarbeiter ist deaktiviert." });
    return;
  }
  if (!user.webLoginEnabled) {
    res.status(400).json({ message: "Weblogin ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }
  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mobileQrTokenHash: tokenHash,
      mobileQrEnabled: true,
      mobileQrExpiresAt: null
    }
  });
  const cfg = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: { mobileAppApiBaseUrl: true }
  });
  const apiBase =
    (cfg?.mobileAppApiBaseUrl || "").trim()
    || (env.WEB_ORIGIN === "*" ? "" : env.WEB_ORIGIN);
  const payload = JSON.stringify({
    kind: "ZEITMANAGMENT_MOBILE_LOGIN",
    apiBase,
    token,
    loginName: user.loginName
  });
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "MOBILE_QR_GENERATED",
    targetType: "User",
    targetId: user.id,
    payload: { loginName: user.loginName, expiresAt: null }
  });
  res.json({
    userId: user.id,
    loginName: user.loginName,
    employeeName: user.name,
    expiresAt: null,
    token,
    payload
  });
});

adminRouter.post("/mobile-qr/revoke", async (req: AuthRequest, res) => {
  const parsed = mobileQrRevokeSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true, loginName: true }
  });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  await prisma.user.update({
    where: { id: user.id },
    data: {
      mobileQrTokenHash: null,
      mobileQrEnabled: false,
      mobileQrExpiresAt: null
    }
  });
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "MOBILE_QR_REVOKED",
    targetType: "User",
    targetId: user.id,
    payload: { loginName: user.loginName }
  });
  res.json({ ok: true });
});

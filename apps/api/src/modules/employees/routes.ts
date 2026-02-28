import { Prisma, Role } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";
import { env } from "../../config/env.js";

export const employeesRouter = Router();

employeesRouter.use(requireAuth);

employeesRouter.get("/me", async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      loginName: true,
      annualVacationDays: true,
      dailyWorkHours: true,
      carryOverVacationDays: true,
      overtimeBalanceHours: true,
      mailNotificationsEnabled: true,
      webLoginEnabled: true,
      timeTrackingEnabled: true,
      rfidTag: true,
      rfidTagActive: true,
      mobileQrEnabled: true,
      mobileQrExpiresAt: true,
      isActive: true
    }
  });

  if (!user) {
    res.status(404).json({ message: "Benutzer nicht gefunden." });
    return;
  }

  res.json(user);
});

employeesRouter.get("/", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      annualVacationDays: true,
      dailyWorkHours: true,
      carryOverVacationDays: true,
      overtimeBalanceHours: true,
      mailNotificationsEnabled: true,
      webLoginEnabled: true,
      timeTrackingEnabled: true,
      loginName: true,
      rfidTag: true,
      rfidTagActive: true,
      mobileQrEnabled: true,
      mobileQrExpiresAt: true
    }
  });

  res.json(users);
});

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().email().optional()
  ),
  loginName: z.string().min(3),
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein.")
    .regex(/^(?=.*([0-9]|[^A-Za-z0-9])).+$/, "Passwort braucht mindestens eine Zahl oder ein Sonderzeichen."),
  role: z.nativeEnum(Role).default(Role.EMPLOYEE),
  annualVacationDays: z.coerce.number().int().min(0).max(365).default(30),
  dailyWorkHours: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.coerce.number().min(1).max(24).optional()),
  carryOverVacationDays: z.coerce.number().min(-365).max(365).default(0),
  mailNotificationsEnabled: z.boolean().default(true),
  webLoginEnabled: z.boolean().default(true),
  timeTrackingEnabled: z.boolean().default(true),
  rfidTag: z.string().optional()
});

employeesRouter.post("/", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "feld"}: ${i.message}`)
      .join(" | ");
    res.status(400).json({ message: `Ungueltige Eingaben. ${issues}`, errors: parsed.error.flatten() });
    return;
  }

  if (req.auth?.role === Role.SUPERVISOR && parsed.data.role !== Role.EMPLOYEE && parsed.data.role !== Role.AZUBI) {
    res.status(403).json({ message: "Vorgesetzte duerfen nur Mitarbeiter anlegen." });
    return;
  }
  if (parsed.data.mailNotificationsEnabled && !parsed.data.email) {
    res.status(400).json({ message: "E-Mail ist Pflicht, wenn Mailbenachrichtigung aktiv ist." });
    return;
  }
  if (req.auth?.role === Role.SUPERVISOR && parsed.data.timeTrackingEnabled === false) {
    res.status(403).json({ message: "Vorgesetzte duerfen Zeiterfassung nicht deaktivieren." });
    return;
  }
  if (req.auth?.role === Role.SUPERVISOR && parsed.data.rfidTag !== undefined) {
    res.status(403).json({ message: "RFID-Zuweisung ist nur fuer Admin erlaubt." });
    return;
  }

  const hash = await bcrypt.hash(parsed.data.password, 12);

  try {
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email: parsed.data.email ?? `${parsed.data.loginName.toLowerCase()}@no-mail.local`,
        loginName: parsed.data.loginName,
        passwordHash: hash,
        role: parsed.data.role,
        annualVacationDays: parsed.data.annualVacationDays,
        dailyWorkHours: parsed.data.dailyWorkHours,
        carryOverVacationDays: parsed.data.carryOverVacationDays,
        mailNotificationsEnabled: parsed.data.mailNotificationsEnabled,
        webLoginEnabled: parsed.data.webLoginEnabled,
        timeTrackingEnabled: parsed.data.timeTrackingEnabled,
        rfidTag: parsed.data.rfidTag,
        rfidTagActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        loginName: true,
        annualVacationDays: true,
        dailyWorkHours: true,
        carryOverVacationDays: true,
        mailNotificationsEnabled: true,
        webLoginEnabled: true,
        timeTrackingEnabled: true,
        rfidTag: true,
        rfidTagActive: true,
        mobileQrEnabled: true,
        mobileQrExpiresAt: true
      }
    });

    try {
      await writeAuditLog({
        actorUserId: req.auth?.userId,
        actorLoginName: await resolveActorLoginName(req.auth?.userId),
        action: "EMPLOYEE_CREATED",
        targetType: "User",
        targetId: user.id,
        payload: { ...parsed.data, password: "***" }
      });
    } catch {
      // Benutzer wurde erfolgreich angelegt; Logging-Fehler soll den Request nicht fehlschlagen lassen.
    }

    res.status(201).json(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      res.status(409).json({ message: "Mitarbeiter konnte nicht angelegt werden (Loginname/E-Mail evtl. bereits vorhanden)." });
      return;
    }
    try {
      await writeAuditLog({
        actorUserId: req.auth?.userId,
        actorLoginName: await resolveActorLoginName(req.auth?.userId),
        action: "EMPLOYEE_CREATE_FAILED",
        targetType: "User",
        payload: { loginName: parsed.data.loginName, email: parsed.data.email ?? null, error: String((e as Error)?.message || e) }
      });
    } catch {
      // Logging-Fehler im Fehlerpfad ignorieren.
    }
    res.status(500).json({ message: "Mitarbeiter konnte nicht angelegt werden." });
  }
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  annualVacationDays: z.number().int().min(0).max(365).optional(),
  dailyWorkHours: z.number().min(1).max(24).nullable().optional(),
  carryOverVacationDays: z.number().min(-365).max(365).optional(),
  overtimeBalanceHours: z.number().min(-10000).max(10000).optional(),
  mailNotificationsEnabled: z.boolean().optional(),
  webLoginEnabled: z.boolean().optional(),
  timeTrackingEnabled: z.boolean().optional(),
  rfidTag: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

const supervisorResetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen lang sein.")
    .regex(/^(?=.*([0-9]|[^A-Za-z0-9])).+$/, "Passwort braucht mindestens eine Zahl oder ein Sonderzeichen.")
});

const mobileQrGenerateSchema = z.object({
  expiresInDays: z.number().int().min(1).max(3650).optional()
});

employeesRouter.patch("/:id", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const userId = String(req.params.id);
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!current) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }

  // Vorgesetzte duerfen keine Rolle auf ADMIN/SUPERVISOR aendern,
  // aber andere Felder auch bei bestehenden Vorgesetzten/Admins bearbeiten.
  if (
    req.auth?.role === Role.SUPERVISOR
    && parsed.data.role
    && parsed.data.role !== current.role
    && parsed.data.role !== Role.EMPLOYEE
    && parsed.data.role !== Role.AZUBI
  ) {
    res.status(403).json({ message: "Vorgesetzte duerfen keine Admins/Vorgesetzten setzen." });
    return;
  }
  if (req.auth?.role === Role.SUPERVISOR) {
    if (parsed.data.overtimeBalanceHours !== undefined || parsed.data.timeTrackingEnabled !== undefined || parsed.data.rfidTag !== undefined) {
      res.status(403).json({ message: "Vorgesetzte duerfen Ueberstundenkonto/Zeiterfassung/RFID nicht aendern." });
      return;
    }
  }

  try {
    const updateData: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.rfidTag !== undefined) {
      updateData.rfidTagActive = true;
    }
    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        annualVacationDays: true,
        dailyWorkHours: true,
        carryOverVacationDays: true,
        overtimeBalanceHours: true,
        mailNotificationsEnabled: true,
        webLoginEnabled: true,
        timeTrackingEnabled: true,
        rfidTag: true,
        rfidTagActive: true,
        mobileQrEnabled: true,
        mobileQrExpiresAt: true
      }
    });

    try {
      await writeAuditLog({
        actorUserId: req.auth?.userId,
        actorLoginName: await resolveActorLoginName(req.auth?.userId),
        action: "EMPLOYEE_UPDATED",
        targetType: "User",
        targetId: updated.id,
        payload: parsed.data
      });
    } catch {
      // Update war erfolgreich; Logging-Fehler darf den Request nicht fehlschlagen lassen.
    }

    res.json(updated);
  } catch {
    res.status(409).json({ message: "Mitarbeiter konnte nicht aktualisiert werden." });
  }
});

employeesRouter.post("/:id/reset-password", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = supervisorResetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const userId = String(req.params.id);
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, loginName: true } });
  if (!target) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (req.auth?.role === Role.SUPERVISOR) {
    const isOwnAccount = req.auth.userId === target.id;
    const isEmployeeOrAzubi = target.role === Role.EMPLOYEE || target.role === Role.AZUBI;
    if (!isOwnAccount && !isEmployeeOrAzubi) {
      res.status(403).json({ message: "Vorgesetzte duerfen nur eigenes Passwort oder Mitarbeiter/AZUBI Passwoerter zuruecksetzen." });
      return;
    }
  }

  const hash = await bcrypt.hash(parsed.data.newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  try {
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "EMPLOYEE_PASSWORD_RESET",
      targetType: "User",
      targetId: userId,
      payload: { loginName: target.loginName }
    });
  } catch {
    // Passwort wurde erfolgreich gesetzt; Logging-Fehler ignorieren.
  }
  res.json({ ok: true });
});

employeesRouter.post("/:id/mobile-qr/generate", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = mobileQrGenerateSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const userId = String(req.params.id);
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, loginName: true, role: true, isActive: true, webLoginEnabled: true }
  });
  if (!target) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }

  if (req.auth.role === Role.SUPERVISOR) {
    const isOwnAccount = req.auth.userId === target.id;
    const isEmployeeOrAzubi = target.role === Role.EMPLOYEE || target.role === Role.AZUBI;
    if (!isOwnAccount && !isEmployeeOrAzubi) {
      res.status(403).json({ message: "Vorgesetzte duerfen nur eigenes Konto oder Mitarbeiter/AZUBI verwalten." });
      return;
    }
  }

  if (!target.isActive) {
    res.status(400).json({ message: "Mitarbeiter ist deaktiviert." });
    return;
  }
  if (!target.webLoginEnabled) {
    res.status(400).json({ message: "Weblogin ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }

  const expiresInDays = parsed.data.expiresInDays ?? 180;
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  const token = crypto.randomBytes(24).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

  await prisma.user.update({
    where: { id: target.id },
    data: {
      mobileQrTokenHash: tokenHash,
      mobileQrEnabled: true,
      mobileQrExpiresAt: expiresAt
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
    loginName: target.loginName
  });

  try {
    await writeAuditLog({
      actorUserId: req.auth.userId,
      actorLoginName: await resolveActorLoginName(req.auth.userId),
      action: "MOBILE_QR_GENERATED",
      targetType: "User",
      targetId: target.id,
      payload: { loginName: target.loginName, expiresAt: expiresAt.toISOString() }
    });
  } catch {
    // QR wurde erstellt; Logging-Fehler darf den Request nicht fehlschlagen lassen.
  }

  res.json({
    userId: target.id,
    loginName: target.loginName,
    employeeName: target.name,
    expiresAt: expiresAt.toISOString(),
    token,
    payload
  });
});

employeesRouter.post("/:id/mobile-qr/revoke", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }
  const userId = String(req.params.id);
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, loginName: true }
  });
  if (!target) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (req.auth.role === Role.SUPERVISOR) {
    const isOwnAccount = req.auth.userId === target.id;
    const isEmployeeOrAzubi = target.role === Role.EMPLOYEE || target.role === Role.AZUBI;
    if (!isOwnAccount && !isEmployeeOrAzubi) {
      res.status(403).json({ message: "Vorgesetzte duerfen nur eigenes Konto oder Mitarbeiter/AZUBI verwalten." });
      return;
    }
  }

  await prisma.user.update({
    where: { id: target.id },
    data: {
      mobileQrTokenHash: null,
      mobileQrEnabled: false,
      mobileQrExpiresAt: null
    }
  });
  try {
    await writeAuditLog({
      actorUserId: req.auth.userId,
      actorLoginName: await resolveActorLoginName(req.auth.userId),
      action: "MOBILE_QR_REVOKED",
      targetType: "User",
      targetId: target.id,
      payload: { loginName: target.loginName }
    });
  } catch {
    // QR wurde deaktiviert; Logging-Fehler ignorieren.
  }
  res.json({ ok: true });
});

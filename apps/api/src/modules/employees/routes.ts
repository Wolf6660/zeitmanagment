import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";

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
      rfidTagActive: true
    }
  });

  res.json(users);
});

const createEmployeeSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  loginName: z.string().min(3),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default(Role.EMPLOYEE),
  annualVacationDays: z.number().int().min(0).max(365).default(30),
  dailyWorkHours: z.number().min(1).max(24).optional(),
  carryOverVacationDays: z.number().min(-365).max(365).default(0),
  mailNotificationsEnabled: z.boolean().default(true),
  webLoginEnabled: z.boolean().default(true),
  timeTrackingEnabled: z.boolean().default(true),
  rfidTag: z.string().optional()
});

employeesRouter.post("/", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben.", errors: parsed.error.flatten() });
    return;
  }

  if (req.auth?.role === Role.SUPERVISOR && parsed.data.role !== Role.EMPLOYEE) {
    res.status(403).json({ message: "Vorgesetzte duerfen nur Mitarbeiter anlegen." });
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
        email: parsed.data.email,
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
        rfidTagActive: true
      }
    });

    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "EMPLOYEE_CREATED",
      targetType: "User",
      targetId: user.id,
      payload: { ...parsed.data, password: "***" }
    });

    res.status(201).json(user);
  } catch {
    res.status(409).json({ message: "Mitarbeiter konnte nicht angelegt werden (Loginname/E-Mail evtl. bereits vorhanden)." });
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
        rfidTagActive: true
      }
    });

    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "EMPLOYEE_UPDATED",
      targetType: "User",
      targetId: updated.id,
      payload: parsed.data
    });

    res.json(updated);
  } catch {
    res.status(409).json({ message: "Mitarbeiter konnte nicht aktualisiert werden." });
  }
});

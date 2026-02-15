import { Role } from "@prisma/client";
import bcrypt from "bcrypt";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";

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
      carryOverVacationDays: true,
      mailNotificationsEnabled: true,
      rfidTag: true,
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
      carryOverVacationDays: true,
      mailNotificationsEnabled: true,
      loginName: true
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
  carryOverVacationDays: z.number().min(0).max(365).default(0),
  mailNotificationsEnabled: z.boolean().default(true),
  rfidTag: z.string().optional()
});

employeesRouter.post("/", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req, res) => {
  const parsed = createEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben.", errors: parsed.error.flatten() });
    return;
  }

  const hash = await bcrypt.hash(parsed.data.password, 12);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      loginName: parsed.data.loginName,
      passwordHash: hash,
      role: parsed.data.role,
      annualVacationDays: parsed.data.annualVacationDays,
      carryOverVacationDays: parsed.data.carryOverVacationDays,
      mailNotificationsEnabled: parsed.data.mailNotificationsEnabled,
      rfidTag: parsed.data.rfidTag
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      loginName: true,
      annualVacationDays: true,
      carryOverVacationDays: true,
      mailNotificationsEnabled: true,
      rfidTag: true
    }
  });

  res.status(201).json(user);
});

const updateEmployeeSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.nativeEnum(Role).optional(),
  annualVacationDays: z.number().int().min(0).max(365).optional(),
  carryOverVacationDays: z.number().min(0).max(365).optional(),
  mailNotificationsEnabled: z.boolean().optional(),
  rfidTag: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

employeesRouter.patch("/:id", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req, res) => {
  const parsed = updateEmployeeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const userId = String(req.params.id);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      annualVacationDays: true,
      carryOverVacationDays: true,
      mailNotificationsEnabled: true,
      rfidTag: true
    }
  });

  res.json(updated);
});

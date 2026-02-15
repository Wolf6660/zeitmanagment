import { LeaveKind, LeaveStatus, Role } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { isWeekend, listDays } from "../../utils/date.js";

export const leaveRouter = Router();

leaveRouter.use(requireAuth);

const createSchema = z.object({
  kind: z.nativeEnum(LeaveKind),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().max(1000).optional()
});

leaveRouter.post("/", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    res.status(400).json({ message: "Enddatum darf nicht vor dem Startdatum liegen." });
    return;
  }

  const year = parsed.data.startDate.getUTCFullYear();
  const employee = await prisma.user.findUnique({ where: { id: req.auth.userId } });
  if (!employee) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }

  let warningOverdrawn = false;
  if (parsed.data.kind === LeaveKind.VACATION) {
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: new Date(Date.UTC(year, 0, 1)),
          lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59))
        }
      }
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

    const requestedDays = listDays(parsed.data.startDate, parsed.data.endDate).filter((d) => {
      const key = d.toISOString().slice(0, 10);
      return !isWeekend(d) && !holidaySet.has(key);
    }).length;

    const approvedVacation = await prisma.leaveRequest.findMany({
      where: {
        userId: req.auth.userId,
        kind: LeaveKind.VACATION,
        status: LeaveStatus.APPROVED,
        startDate: { gte: new Date(Date.UTC(year, 0, 1)) },
        endDate: { lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59)) }
      }
    });

    const consumedDays = approvedVacation.reduce((acc, current) => {
      const days = listDays(current.startDate, current.endDate).filter((d) => {
        const key = d.toISOString().slice(0, 10);
        return !isWeekend(d) && !holidaySet.has(key);
      }).length;
      return acc + days;
    }, 0);

    const available = employee.carryOverVacationDays + employee.annualVacationDays - consumedDays;
    warningOverdrawn = requestedDays > available;
  }

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: req.auth.userId,
      kind: parsed.data.kind,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      note: parsed.data.note
    }
  });

  res.status(201).json({ ...leave, warningOverdrawn });
});

leaveRouter.get("/my", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const result = await prisma.leaveRequest.findMany({
    where: { userId: req.auth.userId },
    orderBy: { requestedAt: "desc" }
  });

  res.json(result);
});

const cancelSchema = z.object({
  leaveId: z.string().min(1)
});

leaveRouter.post("/cancel", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = cancelSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const leave = await prisma.leaveRequest.findUnique({ where: { id: parsed.data.leaveId } });
  if (!leave || leave.userId !== req.auth.userId) {
    res.status(404).json({ message: "Antrag nicht gefunden." });
    return;
  }

  if (leave.status !== LeaveStatus.SUBMITTED) {
    res.status(400).json({ message: "Nur offene Antraege koennen storniert werden." });
    return;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: { status: LeaveStatus.CANCELED }
  });

  res.json(updated);
});

const decisionSchema = z.object({
  leaveId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z.string().max(1000).optional()
});

leaveRouter.post("/decision", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const leave = await prisma.leaveRequest.findUnique({ where: { id: parsed.data.leaveId } });
  if (!leave) {
    res.status(404).json({ message: "Antrag nicht gefunden." });
    return;
  }

  if (leave.status !== LeaveStatus.SUBMITTED) {
    res.status(400).json({ message: "Antrag wurde bereits bearbeitet." });
    return;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      status: parsed.data.decision as LeaveStatus,
      decisionNote: parsed.data.decisionNote,
      decidedById: req.auth.userId,
      decidedAt: new Date()
    }
  });

  res.json(updated);
});

leaveRouter.get("/pending", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const result = await prisma.leaveRequest.findMany({
    where: { status: LeaveStatus.SUBMITTED },
    include: { user: { select: { id: true, name: true, loginName: true } } },
    orderBy: { requestedAt: "asc" }
  });

  res.json(result);
});

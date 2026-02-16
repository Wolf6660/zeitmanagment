import { LeaveKind, LeaveStatus, Role, TimeEntryType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { dayKey, isWeekend, listDays } from "../../utils/date.js";

export const leaveRouter = Router();

leaveRouter.use(requireAuth);

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

async function getVacationAvailabilityDays(userId: string, targetStart: Date, targetEnd: Date): Promise<number> {
  const year = targetStart.getUTCFullYear();
  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (!employee) return 0;

  const holidays = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lte: new Date(Date.UTC(year, 11, 31, 23, 59, 59))
      }
    }
  });
  const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  const approvedVacation = await prisma.leaveRequest.findMany({
    where: {
      userId,
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

  return employee.carryOverVacationDays + employee.annualVacationDays - consumedDays;
}

async function getCurrentMonthOvertimeHours(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [config, holidays, entries] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId, occurredAt: { gte: monthStart, lte: monthEnd } }, orderBy: { occurredAt: "asc" } })
  ]);

  const dailyHours = config?.defaultDailyHours ?? 8;
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));

  const grouped = new Map<string, { type: TimeEntryType; occurredAt: Date }[]>();
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const list = grouped.get(key) ?? [];
    list.push({ type: entry.type, occurredAt: entry.occurredAt });
    grouped.set(key, list);
  }

  let workedTotal = 0;
  let expectedTotal = 0;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    const key = dayKey(date);
    const dayEntries = grouped.get(key) ?? [];

    let openClockIn: Date | null = null;
    let grossMinutes = 0;
    for (const e of dayEntries.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())) {
      if (e.type === TimeEntryType.CLOCK_IN) openClockIn = e.occurredAt;
      if (e.type === TimeEntryType.CLOCK_OUT && openClockIn) {
        const diff = e.occurredAt.getTime() - openClockIn.getTime();
        if (diff > 0) grossMinutes += Math.floor(diff / 60000);
        openClockIn = null;
      }
    }

    const netMinutes = Math.max(grossMinutes - (grossMinutes >= breakAfterHours * 60 ? breakMinutes : 0), 0);
    workedTotal += netMinutes / 60;

    if (!isWeekend(date) && !holidaySet.has(key)) {
      expectedTotal += dailyHours;
    }
  }

  return Number((workedTotal - expectedTotal).toFixed(2));
}

async function ensureNoDoubleBooking(userId: string, startDate: Date, endDate: Date, excludeId?: string): Promise<boolean> {
  const existing = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { in: [LeaveStatus.SUBMITTED, LeaveStatus.APPROVED] },
      ...(excludeId ? { id: { not: excludeId } } : {})
    }
  });

  return existing.some((leave) => overlaps(leave.startDate, leave.endDate, startDate, endDate));
}

const createSchema = z.object({
  kind: z.nativeEnum(LeaveKind),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().min(3).max(1000)
});

leaveRouter.post("/", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    res.status(400).json({ message: "Enddatum darf nicht vor dem Startdatum liegen." });
    return;
  }

  const hasOverlap = await ensureNoDoubleBooking(req.auth.userId, parsed.data.startDate, parsed.data.endDate);
  if (hasOverlap) {
    res.status(409).json({ message: "Es existiert bereits ein Urlaubs-/Ueberstundenantrag in diesem Zeitraum." });
    return;
  }

  const availableVacationDays = await getVacationAvailabilityDays(req.auth.userId, parsed.data.startDate, parsed.data.endDate);
  const warningOverdrawn = parsed.data.kind === LeaveKind.VACATION
    ? listDays(parsed.data.startDate, parsed.data.endDate).filter((d) => !isWeekend(d)).length > availableVacationDays
    : false;

  const leave = await prisma.leaveRequest.create({
    data: {
      userId: req.auth.userId,
      kind: parsed.data.kind,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      note: parsed.data.note
    }
  });

  res.status(201).json({
    ...leave,
    warningOverdrawn,
    availableVacationDays,
    availableOvertimeHours: await getCurrentMonthOvertimeHours(req.auth.userId)
  });
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
  decisionNote: z.string().min(3).max(1000)
});

leaveRouter.post("/decision", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
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

const supervisorUpdateSchema = z.object({
  leaveId: z.string().min(1),
  kind: z.nativeEnum(LeaveKind),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().min(3).max(1000),
  changeNote: z.string().min(3).max(1000)
});

leaveRouter.post("/supervisor-update", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = supervisorUpdateSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }

  if (parsed.data.endDate < parsed.data.startDate) {
    res.status(400).json({ message: "Enddatum darf nicht vor dem Startdatum liegen." });
    return;
  }

  const leave = await prisma.leaveRequest.findUnique({ where: { id: parsed.data.leaveId } });
  if (!leave) {
    res.status(404).json({ message: "Antrag nicht gefunden." });
    return;
  }

  if (leave.status !== LeaveStatus.SUBMITTED) {
    res.status(400).json({ message: "Nur offene Antraege koennen geaendert werden." });
    return;
  }

  const hasOverlap = await ensureNoDoubleBooking(leave.userId, parsed.data.startDate, parsed.data.endDate, leave.id);
  if (hasOverlap) {
    res.status(409).json({ message: "Doppelte Buchung erkannt. Zeitraum ist bereits belegt." });
    return;
  }

  const updated = await prisma.leaveRequest.update({
    where: { id: leave.id },
    data: {
      kind: parsed.data.kind,
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      note: `${parsed.data.note}\n\n[Aenderung Vorgesetzter]: ${parsed.data.changeNote}`
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

  const enriched = await Promise.all(result.map(async (request) => ({
    ...request,
    availableVacationDays: await getVacationAvailabilityDays(request.userId, request.startDate, request.endDate),
    availableOvertimeHours: await getCurrentMonthOvertimeHours(request.userId)
  })));

  res.json(enriched);
});

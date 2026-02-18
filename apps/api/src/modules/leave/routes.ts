import { LeaveKind, LeaveStatus, Role, TimeEntryType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { dayKey, isWeekend, listDays } from "../../utils/date.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";
import { getSupervisorEmails, sendEventMail } from "../../utils/mail.js";

export const leaveRouter = Router();

leaveRouter.use(requireAuth);

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function buildGrossMinutesByStartDay(entries: { type: TimeEntryType; occurredAt: Date }[]): Map<string, number> {
  const sorted = [...entries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const minutesByDay = new Map<string, number>();
  let openClockIn: Date | null = null;
  for (const e of sorted) {
    if (e.type === TimeEntryType.CLOCK_IN) {
      openClockIn = e.occurredAt;
      continue;
    }
    if (e.type === TimeEntryType.CLOCK_OUT && openClockIn) {
      const diff = e.occurredAt.getTime() - openClockIn.getTime();
      if (diff > 0) {
        const key = dayKey(openClockIn);
        minutesByDay.set(key, (minutesByDay.get(key) ?? 0) + Math.floor(diff / 60000));
      }
      openClockIn = null;
    }
  }
  return minutesByDay;
}

async function getVacationAvailabilityDays(userId: string, targetStart: Date, targetEnd: Date): Promise<number> {
  const year = targetStart.getUTCFullYear();
  const employee = await prisma.user.findUnique({ where: { id: userId } });
  if (!employee) return 0;
  if (employee.timeTrackingEnabled === false) return 999999;

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

  // Regel:
  // - positiver Resturlaub wird zuerst verbraucht
  // - negativer Resturlaub belastet zuerst den Jahresurlaub
  // Das resultierende Urlaubskonto entspricht annual + carryOver - consumed.
  return employee.carryOverVacationDays + employee.annualVacationDays - consumedDays;
}

async function getCurrentMonthOvertimeHours(userId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [config, user, holidays, entries] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: userId }, select: { overtimeBalanceHours: true, timeTrackingEnabled: true } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId, occurredAt: { gte: monthStart, lte: monthEnd } }, orderBy: { occurredAt: "asc" } })
  ]);
  if (user?.timeTrackingEnabled === false) {
    return Number((user.overtimeBalanceHours ?? 0).toFixed(2));
  }

  const dailyHours = config?.defaultDailyHours ?? 8;
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));

  const grossByDay = buildGrossMinutesByStartDay(entries.map((entry) => ({ type: entry.type, occurredAt: entry.occurredAt })));

  let workedTotal = 0;
  let expectedTotal = 0;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    const key = dayKey(date);
    const grossMinutes = grossByDay.get(key) ?? 0;

    const netMinutes = Math.max(grossMinutes - (grossMinutes >= breakAfterHours * 60 ? breakMinutes : 0), 0);
    workedTotal += netMinutes / 60;

    if (!isWeekend(date) && !holidaySet.has(key)) {
      expectedTotal += dailyHours;
    }
  }

  return Number(((user?.overtimeBalanceHours ?? 0) + workedTotal - expectedTotal).toFixed(2));
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
  note: z.string().max(1000).optional().default("")
});

leaveRouter.post("/", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteLeaveRequest: true } });
  if ((cfg?.requireNoteLeaveRequest ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
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
  let warningOverdrawn = false;
  if (parsed.data.kind === LeaveKind.VACATION) {
    const holidays = await prisma.holiday.findMany({ where: { date: { gte: parsed.data.startDate, lte: parsed.data.endDate } } });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const requestedWorkingDays = listDays(parsed.data.startDate, parsed.data.endDate).filter((d) => {
      const key = d.toISOString().slice(0, 10);
      return !isWeekend(d) && !holidaySet.has(key);
    }).length;
    warningOverdrawn = requestedWorkingDays > availableVacationDays;
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
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "LEAVE_REQUEST_CREATED",
    targetType: "LeaveRequest",
    targetId: leave.id,
    payload: parsed.data
  });

  const requester = await prisma.user.findUnique({
    where: { id: req.auth.userId },
    select: { name: true, loginName: true }
  });
  const supervisors = await getSupervisorEmails();
  const eventKey = parsed.data.kind === LeaveKind.VACATION ? "mailOnSupervisorLeaveRequest" : "mailOnSupervisorOvertimeRequest";
  await Promise.all(
    supervisors.map((to) =>
      sendEventMail(eventKey, {
        to,
        subject: `Neuer Antrag (${parsed.data.kind === LeaveKind.VACATION ? "Urlaub" : "Ueberstunden"})`,
        text: `${requester?.name || requester?.loginName || "Mitarbeiter"} hat einen Antrag gestellt (${parsed.data.kind}). Zeitraum: ${parsed.data.startDate.toISOString().slice(0, 10)} bis ${parsed.data.endDate.toISOString().slice(0, 10)}.`
      }).catch(() => undefined)
    )
  );

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
    include: {
      decidedBy: { select: { id: true, name: true, loginName: true } }
    },
    orderBy: { requestedAt: "desc" }
  });

  res.json(result);
});

leaveRouter.get("/all", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const result = await prisma.leaveRequest.findMany({
    include: {
      user: { select: { id: true, name: true, loginName: true } },
      decidedBy: { select: { id: true, name: true, loginName: true } }
    },
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
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "LEAVE_REQUEST_CANCELED",
    targetType: "LeaveRequest",
    targetId: updated.id
  });

  res.json(updated);
});

const decisionSchema = z.object({
  leaveId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  decisionNote: z.string().max(1000).optional().default("")
});

leaveRouter.post("/decision", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = decisionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteLeaveDecision: true } });
  if ((cfg?.requireNoteLeaveDecision ?? true) && !parsed.data.decisionNote.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
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
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: parsed.data.decision === "APPROVED" ? "LEAVE_REQUEST_APPROVED" : "LEAVE_REQUEST_REJECTED",
    targetType: "LeaveRequest",
    targetId: updated.id,
    payload: { decisionNote: parsed.data.decisionNote }
  });

  const employee = await prisma.user.findUnique({
    where: { id: leave.userId },
    select: { email: true, mailNotificationsEnabled: true, name: true }
  });
  if (employee?.email && employee.mailNotificationsEnabled) {
    const eventKey = leave.kind === LeaveKind.VACATION ? "mailOnEmployeeLeaveDecision" : "mailOnEmployeeOvertimeDecision";
    await sendEventMail(eventKey, {
      to: employee.email,
      subject: `Ihr Antrag wurde ${parsed.data.decision === "APPROVED" ? "genehmigt" : "abgelehnt"}`,
      text: `Antrag: ${leave.kind}\nZeitraum: ${leave.startDate.toISOString().slice(0, 10)} bis ${leave.endDate.toISOString().slice(0, 10)}\nStatus: ${parsed.data.decision}\nNotiz: ${parsed.data.decisionNote}`
    }).catch(() => undefined);
  }

  res.json(updated);
});

const supervisorUpdateSchema = z.object({
  leaveId: z.string().min(1),
  kind: z.nativeEnum(LeaveKind),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  note: z.string().max(1000).optional().default(""),
  changeNote: z.string().max(1000).optional().default("")
});

leaveRouter.post("/supervisor-update", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = supervisorUpdateSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteLeaveSupervisorUpdate: true } });
  if ((cfg?.requireNoteLeaveSupervisorUpdate ?? true) && !parsed.data.changeNote.trim()) {
    res.status(400).json({ message: "Aenderungsnotiz ist Pflicht." });
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
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "LEAVE_REQUEST_SUPERVISOR_UPDATED",
    targetType: "LeaveRequest",
    targetId: updated.id,
    payload: parsed.data
  });

  res.json(updated);
});

leaveRouter.get("/pending", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const result = await prisma.leaveRequest.findMany({
    where: { status: LeaveStatus.SUBMITTED },
    include: { user: { select: { id: true, name: true, loginName: true } } },
    orderBy: { requestedAt: "asc" }
  });

  const enriched = await Promise.all(result.map(async (request) => {
    const availableVacationDays = await getVacationAvailabilityDays(request.userId, request.startDate, request.endDate);
    const holidays = await prisma.holiday.findMany({
      where: { date: { gte: request.startDate, lte: request.endDate } }
    });
    const holidaySet = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
    const requestedWorkingDays = listDays(request.startDate, request.endDate).filter((d) => {
      const key = d.toISOString().slice(0, 10);
      return !isWeekend(d) && !holidaySet.has(key);
    }).length;
    const remainingVacationAfterRequest = request.kind === LeaveKind.VACATION
      ? Number((availableVacationDays - requestedWorkingDays).toFixed(2))
      : Number(availableVacationDays.toFixed(2));

    return {
      ...request,
      availableVacationDays,
      requestedWorkingDays,
      remainingVacationAfterRequest,
      availableOvertimeHours: await getCurrentMonthOvertimeHours(request.userId)
    };
  }));

  res.json(enriched);
});

leaveRouter.get("/availability/:userId", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }
  const userId = String(req.params.userId);
  if (req.auth.role === Role.EMPLOYEE && req.auth.userId !== userId) {
    res.status(403).json({ message: "Keine Berechtigung." });
    return;
  }

  const now = new Date();
  const availableVacationDays = await getVacationAvailabilityDays(userId, now, now);
  const availableOvertimeHours = await getCurrentMonthOvertimeHours(userId);
  res.json({
    userId,
    availableVacationDays: Number(availableVacationDays.toFixed(2)),
    availableOvertimeHours: Number(availableOvertimeHours.toFixed(2))
  });
});

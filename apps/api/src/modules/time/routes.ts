import { Router } from "express";
import { Role, TimeEntrySource, TimeEntryType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { dayKey, isWeekend } from "../../utils/date.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";

export const timeRouter = Router();

timeRouter.use(requireAuth);

function zodFirstMessage(result: z.SafeParseError<unknown>): string {
  const issue = result.error.issues[0];
  const msg = issue?.message || "Ungueltige Eingaben.";
  if (msg.startsWith("Invalid")) return "Ungueltige Eingaben.";
  return msg;
}

function parseIsoDateParts(date: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseTimeParts(time: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/.exec(time);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]) };
}

function parseWorkingDaySet(value?: string | null): Set<number> {
  const raw = (value || "MON,TUE,WED,THU,FRI").split(",").map((x) => x.trim().toUpperCase());
  const map: Record<string, number> = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const out = new Set<number>();
  for (const v of raw) {
    if (v in map) out.add(map[v]);
  }
  return out;
}

const clockSchema = z.object({
  type: z.nativeEnum(TimeEntryType),
  reasonCode: z.string().optional(),
  reasonText: z.string().min(3)
});

timeRouter.post("/clock", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = clockSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Grund ist Pflicht." });
    return;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: req.auth.userId,
      type: parsed.data.type,
      source: TimeEntrySource.WEB,
      reasonCode: parsed.data.reasonCode,
      reasonText: parsed.data.reasonText,
      occurredAt: new Date()
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "CLOCK_EVENT",
    targetType: "TimeEntry",
    targetId: entry.id,
    payload: { type: parsed.data.type, reasonText: parsed.data.reasonText }
  });

  res.status(201).json(entry);
});

const selfCorrectionSchema = z.object({
  type: z.nativeEnum(TimeEntryType),
  occurredAt: z.coerce.date(),
  correctionComment: z.string().min(1)
});

timeRouter.post("/self-correction", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = selfCorrectionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: req.auth.userId,
      type: parsed.data.type,
      source: TimeEntrySource.MANUAL_CORRECTION,
      isManualCorrection: true,
      correctionComment: parsed.data.correctionComment,
      reasonText: parsed.data.correctionComment,
      occurredAt: parsed.data.occurredAt,
      createdById: req.auth.userId
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "SELF_CORRECTION_CREATED",
    targetType: "TimeEntry",
    targetId: entry.id,
    payload: parsed.data
  });

  res.status(201).json(entry);
});

const correctionSchema = z.object({
  userId: z.string().min(1),
  type: z.nativeEnum(TimeEntryType),
  occurredAt: z.coerce.date(),
  correctionComment: z.string().min(10),
  reasonCode: z.string().optional(),
  reasonText: z.string().optional()
});

timeRouter.post("/correction", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben oder Kommentar zu kurz." });
    return;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: parsed.data.userId,
      type: parsed.data.type,
      source: TimeEntrySource.MANUAL_CORRECTION,
      isManualCorrection: true,
      correctionComment: parsed.data.correctionComment,
      reasonCode: parsed.data.reasonCode,
      reasonText: parsed.data.reasonText,
      occurredAt: parsed.data.occurredAt,
      createdById: req.auth.userId
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "SUPERVISOR_CORRECTION_CREATED",
    targetType: "TimeEntry",
    targetId: entry.id,
    payload: parsed.data
  });

  res.status(201).json(entry);
});

const creditSchema = z.object({
  userId: z.string().min(1),
  date: z.coerce.date(),
  minutes: z.number().int().min(1).max(180),
  reason: z.string().min(5)
});

timeRouter.post("/break-credit", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const result = await prisma.breakCredit.create({
    data: {
      userId: parsed.data.userId,
      date: parsed.data.date,
      minutes: parsed.data.minutes,
      reason: parsed.data.reason,
      createdById: req.auth.userId
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "BREAK_CREDIT_CREATED",
    targetType: "BreakCredit",
    targetId: result.id,
    payload: parsed.data
  });

  res.status(201).json(result);
});

const overtimeAdjustmentSchema = z.object({
  userId: z.string().trim().min(1, "Mitarbeiter ist Pflicht."),
  date: z
    .string()
    .trim()
    .min(1, "Datum ist Pflicht.")
    .refine((v) => !Number.isNaN(new Date(v).getTime()), "Datum ist ungueltig.")
    .transform((v) => new Date(v)),
  hours: z
    .preprocess((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    }, z.number().finite("Stunden sind ungueltig.").min(-500, "Stunden muessen >= -500 sein.").max(500, "Stunden muessen <= 500 sein.")),
  note: z.string().trim().min(3, "Notiz ist Pflicht.")
});

timeRouter.post("/overtime-adjustment", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = overtimeAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const adjustment = await prisma.overtimeAdjustment.create({
    data: {
      userId: parsed.data.userId,
      date: parsed.data.date,
      hours: parsed.data.hours,
      reason: parsed.data.note,
      createdById: req.auth.userId
    }
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "OVERTIME_ADJUSTMENT_CREATED",
    targetType: "OvertimeAdjustment",
    targetId: adjustment.id,
    payload: parsed.data
  });

  res.status(201).json(adjustment);
});

timeRouter.get("/overtime-adjustment/:userId", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req, res) => {
  const userId = String(req.params.userId);
  const entries = await prisma.overtimeAdjustment.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 50 });
  res.json(entries);
});

const dayOverrideSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(10),
  note: z.string().min(1),
  events: z
    .array(
      z.object({
        type: z.nativeEnum(TimeEntryType),
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Zeit ist ungueltig (HH:MM).")
      })
    )
    .min(1)
});

timeRouter.post("/day-override", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = dayOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }
  const dateParts = parseIsoDateParts(parsed.data.date);
  if (!dateParts) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }

  try {
    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));
    await prisma.timeEntry.deleteMany({ where: { userId: parsed.data.userId, occurredAt: { gte: dayStart, lte: dayEnd } } });
    const created = [];
    for (const e of parsed.data.events) {
      const t = parseTimeParts(e.time);
      if (!t) {
        res.status(400).json({ message: "Zeit ist ungueltig (HH:MM)." });
        return;
      }
      const occurredAt = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, t.hour, t.minute, 0));
      const row = await prisma.timeEntry.create({
        data: {
          userId: parsed.data.userId,
          type: e.type,
          source: TimeEntrySource.MANUAL_CORRECTION,
          isManualCorrection: true,
          correctionComment: parsed.data.note,
          reasonText: parsed.data.note,
          occurredAt,
          createdById: req.auth.userId
        }
      });
      created.push(row);
    }
    try {
      await writeAuditLog({
        actorUserId: req.auth.userId,
        actorLoginName: await resolveActorLoginName(req.auth.userId),
        action: "DAY_OVERRIDE_SUPERVISOR",
        targetType: "TimeEntry",
        targetId: parsed.data.userId,
        payload: parsed.data
      });
    } catch {
      // Speichern war erfolgreich; Log-Fehler darf keine 500 fuer den Benutzer ausloesen.
    }
    res.json({ createdCount: created.length });
  } catch {
    res.status(500).json({ message: "Tag konnte nicht gespeichert werden." });
  }
});

const selfDayOverrideSchema = z.object({
  date: z.string().min(10),
  note: z.string().min(1),
  events: z
    .array(
      z.object({
        type: z.nativeEnum(TimeEntryType),
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Zeit ist ungueltig (HH:MM).")
      })
    )
    .min(1)
});

timeRouter.post("/day-override-self", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = selfDayOverrideSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }
  const dateParts = parseIsoDateParts(parsed.data.date);
  if (!dateParts) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }

  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { selfCorrectionMaxDays: true } });
  const maxDays = cfg?.selfCorrectionMaxDays ?? 3;
  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const selected = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
  const diffDays = Math.floor((todayUtc.getTime() - selected.getTime()) / 86400000);
  if (Number.isNaN(diffDays) || diffDays < 0) {
    res.status(403).json({ message: "Nachtrag in die Zukunft ist nicht erlaubt." });
    return;
  }
  if (diffDays > maxDays) {
    res.status(403).json({ message: `Nachtrag nur bis ${maxDays} Tage rueckwirkend erlaubt.` });
    return;
  }
  try {
    const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
    const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));
    await prisma.timeEntry.deleteMany({ where: { userId: req.auth.userId, occurredAt: { gte: dayStart, lte: dayEnd } } });
    for (const e of parsed.data.events) {
      const t = parseTimeParts(e.time);
      if (!t) {
        res.status(400).json({ message: "Zeit ist ungueltig (HH:MM)." });
        return;
      }
      const occurredAt = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, t.hour, t.minute, 0));
      await prisma.timeEntry.create({
        data: {
          userId: req.auth.userId,
          type: e.type,
          source: TimeEntrySource.MANUAL_CORRECTION,
          isManualCorrection: true,
          correctionComment: parsed.data.note,
          reasonText: parsed.data.note,
          occurredAt,
          createdById: req.auth.userId
        }
      });
    }
    try {
      await writeAuditLog({
        actorUserId: req.auth.userId,
        actorLoginName: await resolveActorLoginName(req.auth.userId),
        action: "DAY_OVERRIDE_SELF",
        targetType: "TimeEntry",
        targetId: req.auth.userId,
        payload: parsed.data
      });
    } catch {
      // Speichern war erfolgreich; Log-Fehler darf keine 500 fuer den Benutzer ausloesen.
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ message: "Nachtrag konnte nicht gespeichert werden." });
  }
});

timeRouter.get("/month/:userId", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }
  const targetUserId = String(req.params.userId);
  if (req.auth.role === Role.EMPLOYEE && req.auth.userId !== targetUserId) {
    res.status(403).json({ message: "Keine Berechtigung." });
    return;
  }
  const year = Number(req.query.year);
  const month = Number(req.query.month);
  if (!year || !month || month < 1 || month > 12) {
    res.status(400).json({ message: "Jahr/Monat ungueltig." });
    return;
  }
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  const [config, user, holidays, entries] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { dailyWorkHours: true } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId: targetUserId, occurredAt: { gte: monthStart, lte: monthEnd } }, orderBy: { occurredAt: "asc" } })
  ]);
  const dailyHours = user?.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = dayKey(e.occurredAt);
    const list = byDay.get(key) ?? [];
    list.push(e);
    byDay.set(key, list);
  }
  const days = [];
  let monthPlanned = 0;
  let monthWorked = 0;
  for (let d = 1; d <= monthEnd.getUTCDate(); d += 1) {
    const date = new Date(Date.UTC(year, month - 1, d));
    const key = dayKey(date);
    const dayEntries = (byDay.get(key) ?? []).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    const isHoliday = holidaySet.has(key);
    const weekend = isWeekend(date);
    const planned = workingDays.has(date.getUTCDay()) && !isHoliday ? dailyHours : 0;
    let openIn: Date | null = null;
    let grossMin = 0;
    for (const e of dayEntries) {
      if (e.type === TimeEntryType.CLOCK_IN) openIn = e.occurredAt;
      if (e.type === TimeEntryType.CLOCK_OUT && openIn) {
        const diff = e.occurredAt.getTime() - openIn.getTime();
        if (diff > 0) grossMin += Math.floor(diff / 60000);
        openIn = null;
      }
    }
    const worked = Number((grossMin / 60).toFixed(2));
    monthPlanned += planned;
    monthWorked += worked;
    days.push({
      date: key,
      plannedHours: Number(planned.toFixed(2)),
      workedHours: worked,
      isHoliday,
      isWeekend: weekend,
      hasManualCorrection: dayEntries.some((e) => e.isManualCorrection),
      entries: dayEntries.map((e) => ({ id: e.id, type: e.type, time: e.occurredAt.toISOString().slice(11, 16), source: e.source, reasonText: e.reasonText }))
    });
  }
  res.json({ year, month, dailyHours, monthPlanned: Number(monthPlanned.toFixed(2)), monthWorked: Number(monthWorked.toFixed(2)), days });
});

function calculateWorkedMinutes(entries: { type: TimeEntryType; occurredAt: Date }[]): number {
  const sorted = [...entries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let openClockIn: Date | null = null;
  let minutes = 0;

  for (const e of sorted) {
    if (e.type === TimeEntryType.CLOCK_IN) {
      openClockIn = e.occurredAt;
    }
    if (e.type === TimeEntryType.CLOCK_OUT && openClockIn) {
      const diffMs = e.occurredAt.getTime() - openClockIn.getTime();
      if (diffMs > 0) {
        minutes += Math.floor(diffMs / 60000);
      }
      openClockIn = null;
    }
  }

  return minutes;
}

timeRouter.get("/summary/:userId", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const targetUserId = String(req.params.userId);
  if (req.auth.role === Role.EMPLOYEE && req.auth.userId !== targetUserId) {
    res.status(403).json({ message: "Keine Berechtigung." });
    return;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [config, user, holidays, entries, credits, sickLeaves, leaveRequests, overtimeAdjustments] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { dailyWorkHours: true } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId: targetUserId, occurredAt: { gte: monthStart, lte: monthEnd } } }),
    prisma.breakCredit.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.sickLeave.findMany({ where: { userId: targetUserId, startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
    prisma.leaveRequest.findMany({ where: { userId: targetUserId, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
    prisma.overtimeAdjustment.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } })
  ]);

  const dailyHours = user?.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;

  const grouped = new Map<string, { type: TimeEntryType; occurredAt: Date }[]>();
  for (const entry of entries) {
    const key = dayKey(entry.occurredAt);
    const list = grouped.get(key) ?? [];
    list.push({ type: entry.type, occurredAt: entry.occurredAt });
    grouped.set(key, list);
  }

  const creditByDay = new Map<string, number>();
  for (const c of credits) {
    const key = dayKey(c.date);
    creditByDay.set(key, (creditByDay.get(key) ?? 0) + c.minutes);
  }

  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));

  let workedTotal = 0;
  let expectedTotal = 0;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    const key = dayKey(date);
    const dayEntries = grouped.get(key) ?? [];

    const grossMinutes = calculateWorkedMinutes(dayEntries);
    const autoBreakApplies = grossMinutes >= breakAfterHours * 60;
    const dayCredit = creditByDay.get(key) ?? 0;
    const netMinutes = Math.max(grossMinutes - (autoBreakApplies ? breakMinutes : 0) + dayCredit, 0);

    workedTotal += netMinutes / 60;

    const isHoliday = holidaySet.has(key);
    if (workingDays.has(date.getUTCDay()) && !isHoliday) {
      expectedTotal += dailyHours;
    }
  }

  const approvalDays = leaveRequests.reduce((sum, reqLeave) => {
    const start = new Date(Math.max(reqLeave.startDate.getTime(), monthStart.getTime()));
    const end = new Date(Math.min(reqLeave.endDate.getTime(), monthEnd.getTime()));
    const days = Math.max(Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1, 0);
    return sum + days;
  }, 0);

  const sickDays = sickLeaves.reduce((sum, s) => {
    const start = new Date(Math.max(s.startDate.getTime(), monthStart.getTime()));
    const end = new Date(Math.min(s.endDate.getTime(), monthEnd.getTime()));
    const days = Math.max(Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1, 0);
    return sum + days;
  }, 0);

  const manualAdjustmentHours = overtimeAdjustments.reduce((sum, a) => sum + a.hours, 0);
  const totalIncludingAbsence = workedTotal + approvalDays * dailyHours + sickDays * dailyHours;
  const overtime = totalIncludingAbsence - expectedTotal + manualAdjustmentHours;

  const longStreakAlert = entries.length >= 2
    ? entries
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .some((entry, index, arr) => {
          if (entry.type !== TimeEntryType.CLOCK_IN) return false;
          const nextOut = arr.slice(index + 1).find((e) => e.type === TimeEntryType.CLOCK_OUT);
          if (!nextOut) return false;
          return nextOut.occurredAt.getTime() - entry.occurredAt.getTime() > 12 * 60 * 60 * 1000;
        })
    : false;

  res.json({
    month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
    plannedHours: Number(expectedTotal.toFixed(2)),
    workedHours: Number(workedTotal.toFixed(2)),
    overtimeHours: Number(overtime.toFixed(2)),
    manualAdjustmentHours: Number(manualAdjustmentHours.toFixed(2)),
    longShiftAlert: longStreakAlert
  });
});

timeRouter.get("/today/:userId", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const targetUserId = String(req.params.userId);
  if (req.auth.role === Role.EMPLOYEE && req.auth.userId !== targetUserId) {
    res.status(403).json({ message: "Keine Berechtigung." });
    return;
  }

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: {
      userId: targetUserId,
      occurredAt: { gte: start, lte: end }
    },
    orderBy: { occurredAt: "asc" },
    select: {
      id: true,
      type: true,
      occurredAt: true,
      source: true,
      reasonText: true
    }
  });

  res.json(entries);
});

timeRouter.get("/supervisor-overview", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req: AuthRequest, res) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));
  const historyStart = new Date(Date.UTC(2000, 0, 1));

  const [users, config, holidaysAll] = await Promise.all([
    prisma.user.findMany({ where: { isActive: true }, select: { id: true, dailyWorkHours: true } }),
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.holiday.findMany({ where: { date: { gte: historyStart, lte: monthEnd } } })
  ]);

  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;
  const holidaySet = new Set(holidaysAll.map((h) => dayKey(h.date)));

  const rows = await Promise.all(users.map(async (u) => {
    const dailyHours = u.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
    const [entries, credits, leaveRequests, sickLeaves, adjustments] = await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId: u.id, occurredAt: { gte: historyStart, lte: monthEnd } },
        select: { type: true, occurredAt: true }
      }),
      prisma.breakCredit.findMany({
        where: { userId: u.id, date: { gte: historyStart, lte: monthEnd } },
        select: { date: true, minutes: true }
      }),
      prisma.leaveRequest.findMany({
        where: { userId: u.id, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: historyStart } },
        select: { startDate: true, endDate: true }
      }),
      prisma.sickLeave.findMany({
        where: { userId: u.id, startDate: { lte: monthEnd }, endDate: { gte: historyStart } },
        select: { startDate: true, endDate: true }
      }),
      prisma.overtimeAdjustment.findMany({
        where: { userId: u.id, date: { gte: historyStart, lte: monthEnd } },
        select: { date: true, hours: true }
      })
    ]);

    const byDay = new Map<string, Array<{ type: TimeEntryType; occurredAt: Date }>>();
    for (const e of entries) {
      const k = dayKey(e.occurredAt);
      const list = byDay.get(k) ?? [];
      list.push({ type: e.type, occurredAt: e.occurredAt });
      byDay.set(k, list);
    }
    const creditByDay = new Map<string, number>();
    for (const c of credits) {
      const k = dayKey(c.date);
      creditByDay.set(k, (creditByDay.get(k) ?? 0) + c.minutes);
    }

    const leaveDays = new Set<string>();
    for (const l of leaveRequests) {
      const s = new Date(Math.max(l.startDate.getTime(), historyStart.getTime()));
      const e = new Date(Math.min(l.endDate.getTime(), monthEnd.getTime()));
      for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86400000)) {
        leaveDays.add(dayKey(d));
      }
    }
    const sickDays = new Set<string>();
    for (const l of sickLeaves) {
      const s = new Date(Math.max(l.startDate.getTime(), historyStart.getTime()));
      const e = new Date(Math.min(l.endDate.getTime(), monthEnd.getTime()));
      for (let d = new Date(s); d <= e; d = new Date(d.getTime() + 86400000)) {
        sickDays.add(dayKey(d));
      }
    }

    const manualByDay = new Map<string, number>();
    for (const a of adjustments) {
      const k = dayKey(a.date);
      manualByDay.set(k, (manualByDay.get(k) ?? 0) + a.hours);
    }

    let plannedCurrent = 0;
    let overtimeCurrent = 0;
    let overtimeBeforeCurrent = 0;

    for (let d = new Date(historyStart); d <= monthEnd; d = new Date(d.getTime() + 86400000)) {
      const k = dayKey(d);
      const isWorkday = workingDays.has(d.getUTCDay()) && !holidaySet.has(k);
      const planned = isWorkday ? dailyHours : 0;
      const dayEntries = (byDay.get(k) ?? []).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
      let openIn: Date | null = null;
      let grossMin = 0;
      for (const e of dayEntries) {
        if (e.type === TimeEntryType.CLOCK_IN) openIn = e.occurredAt;
        if (e.type === TimeEntryType.CLOCK_OUT && openIn) {
          const diff = e.occurredAt.getTime() - openIn.getTime();
          if (diff > 0) grossMin += Math.floor(diff / 60000);
          openIn = null;
        }
      }
      const netWorked = Math.max(grossMin - (grossMin >= breakAfterHours * 60 ? breakMinutes : 0) + (creditByDay.get(k) ?? 0), 0) / 60;
      const absenceHours = isWorkday ? ((leaveDays.has(k) ? dailyHours : 0) + (sickDays.has(k) ? dailyHours : 0)) : 0;
      const dayOvertime = netWorked + absenceHours - planned + (manualByDay.get(k) ?? 0);
      if (d >= monthStart) {
        plannedCurrent += planned;
        overtimeCurrent += dayOvertime;
      } else {
        overtimeBeforeCurrent += dayOvertime;
      }
    }

    return {
      userId: u.id,
      istHours: Number((plannedCurrent - overtimeCurrent).toFixed(2)),
      overtimeWithoutCurrentMonth: Number(overtimeBeforeCurrent.toFixed(2)),
      currentMonthOvertime: Number(overtimeCurrent.toFixed(2))
    };
  }));

  res.json(rows);
});

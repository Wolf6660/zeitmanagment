import { Router } from "express";
import { ApprovalStatus, Role, TimeEntrySource, TimeEntryType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { AuthRequest, requireAuth, requireRole } from "../../utils/auth.js";
import { dayKey, isWeekend } from "../../utils/date.js";
import { resolveActorLoginName, writeAuditLog } from "../../utils/audit.js";
import { getSupervisorEmails, sendEventMail, sendMailIfEnabled } from "../../utils/mail.js";

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

function dateOnlyUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
}

function isDateWithinRange(date: Date, start: Date, end: Date): boolean {
  const d = dateOnlyUtc(date).getTime();
  const s = dateOnlyUtc(start).getTime();
  const e = dateOnlyUtc(end).getTime();
  return d >= s && d <= e;
}

async function isHolidayDate(date: Date): Promise<boolean> {
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
  const dayEnd = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  const found = await prisma.holiday.findFirst({ where: { date: { gte: dayStart, lte: dayEnd } }, select: { id: true } });
  return Boolean(found);
}

async function upsertSpecialWorkApproval(userId: string, date: Date, note?: string): Promise<void> {
  const holiday = await isHolidayDate(date);
  const weekend = isWeekend(date);
  if (!holiday && !weekend) return;
  const dayStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
  await prisma.specialWorkApproval.upsert({
    where: { userId_date: { userId, date: dayStart } },
    create: { userId, date: dayStart, status: ApprovalStatus.SUBMITTED, note: note || null },
    update: { status: ApprovalStatus.SUBMITTED, note: note || null, decidedAt: null, decidedById: null }
  });
}

async function upsertCrossMidnightApprovalIfNeeded(userId: string, clockOutAt: Date, note?: string): Promise<void> {
  const cfg = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: { requireApprovalForCrossMidnight: true }
  });
  if (!(cfg?.requireApprovalForCrossMidnight ?? true)) return;

  const [lastIn, lastOut] = await Promise.all([
    prisma.timeEntry.findFirst({
      where: { userId, type: TimeEntryType.CLOCK_IN, occurredAt: { lt: clockOutAt } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { occurredAt: true }
    }),
    prisma.timeEntry.findFirst({
      where: { userId, type: TimeEntryType.CLOCK_OUT, occurredAt: { lt: clockOutAt } },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      select: { occurredAt: true }
    })
  ]);

  if (!lastIn) return;
  const diffMs = clockOutAt.getTime() - lastIn.occurredAt.getTime();
  if (diffMs > 12 * 60 * 60 * 1000) {
    const employee = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, mailNotificationsEnabled: true, name: true, loginName: true }
    });
    if (employee?.email && employee.mailNotificationsEnabled) {
      await sendEventMail("mailOnEmployeeLongShift", {
        to: employee.email,
        subject: "Hinweis: Sehr lange Schicht erkannt",
        text: `${employee.name || employee.loginName}: Bitte Schicht pruefen. Dauer > 12 Stunden am ${clockOutAt.toISOString().slice(0, 10)}.`
      }).catch(() => undefined);
    }
  }
  if (lastOut && lastOut.occurredAt >= lastIn.occurredAt) return;
  if (dayKey(lastIn.occurredAt) === dayKey(clockOutAt)) return;
  await upsertSpecialWorkApproval(userId, lastIn.occurredAt, note || "Arbeit ueber 0:00");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, loginName: true } });
  const recipients = await getSupervisorEmails();
  await Promise.all(
    recipients.map((to) =>
      sendEventMail("mailOnSupervisorCrossMidnight", {
        to,
        subject: "Genehmigung noetig: Arbeit ueber 0:00",
        text: `${user?.name || user?.loginName || "Mitarbeiter"} hat eine Schicht ueber 0:00 beendet (${lastIn.occurredAt.toISOString().slice(0, 10)} -> ${clockOutAt.toISOString().slice(0, 10)}).`
      }).catch(() => undefined)
    )
  );
}

const clockSchema = z.object({
  type: z.nativeEnum(TimeEntryType),
  reasonCode: z.string().optional(),
  reasonText: z.string().max(255).optional()
});

timeRouter.post("/clock", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = clockSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Grund ist Pflicht." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireReasonWebClock: true } });
  if ((cfg?.requireReasonWebClock ?? true) && !String(parsed.data.reasonText || "").trim()) {
    res.status(400).json({ message: "Grund ist Pflicht." });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timeTrackingEnabled: true } });
  if (me && !me.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
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

  await upsertSpecialWorkApproval(req.auth.userId, entry.occurredAt, parsed.data.reasonText);
  if (entry.type === TimeEntryType.CLOCK_OUT) {
    await upsertCrossMidnightApprovalIfNeeded(req.auth.userId, entry.occurredAt, parsed.data.reasonText);
  }

  res.status(201).json(entry);
});

const selfCorrectionSchema = z.object({
  type: z.nativeEnum(TimeEntryType),
  occurredAt: z.coerce.date(),
  correctionComment: z.string().max(1000)
});

timeRouter.post("/self-correction", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = selfCorrectionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben. Notiz ist Pflicht." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteSelfCorrection: true } });
  if ((cfg?.requireNoteSelfCorrection ?? true) && !parsed.data.correctionComment.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timeTrackingEnabled: true } });
  if (me && !me.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
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

  await upsertSpecialWorkApproval(req.auth.userId, entry.occurredAt, parsed.data.correctionComment);

  res.status(201).json(entry);
});

const correctionSchema = z.object({
  userId: z.string().min(1),
  type: z.nativeEnum(TimeEntryType),
  occurredAt: z.coerce.date(),
  correctionComment: z.string().max(1000),
  reasonCode: z.string().optional(),
  reasonText: z.string().optional()
});

timeRouter.post("/correction", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = correctionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben oder Kommentar zu kurz." });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteSupervisorCorrection: true } });
  if ((cfg?.requireNoteSupervisorCorrection ?? true) && !parsed.data.correctionComment.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { timeTrackingEnabled: true } });
  if (target && !target.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
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

  await upsertSpecialWorkApproval(parsed.data.userId, entry.occurredAt, parsed.data.correctionComment);

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

const sickSchema = z.object({
  userId: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  partialDayHours: z.number().min(0).max(24).optional(),
  note: z.string().max(1000).optional()
});

timeRouter.post("/sick-leave", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = sickSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  if (parsed.data.endDate < parsed.data.startDate) {
    res.status(400).json({ message: "Enddatum darf nicht vor Startdatum liegen." });
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
    include: { user: { select: { name: true, loginName: true } } }
  });

  const cfg = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: { accountantMailEnabled: true, accountantMailOnSick: true, accountantEmail: true }
  });
  if (cfg?.accountantMailEnabled && cfg.accountantMailOnSick && cfg.accountantEmail) {
    await sendMailIfEnabled({
      to: cfg.accountantEmail,
      subject: `Krankmeldung: ${sick.user.name}`,
      text: `Krankheit eingetragen fuer ${sick.user.name} (${sick.user.loginName}) von ${sick.startDate.toISOString().slice(0, 10)} bis ${sick.endDate.toISOString().slice(0, 10)}.`
    }).catch(() => undefined);
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

const sickDeleteDaySchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(10)
});

timeRouter.post("/sick-leave/delete-day", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = sickDeleteDaySchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const actorUserId = req.auth.userId;
  const p = parseIsoDateParts(parsed.data.date);
  if (!p) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }
  const dayStart = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(p.year, p.month - 1, p.day, 23, 59, 59, 999));
  const prevDayEnd = new Date(dayStart.getTime() - 1);
  const nextDayStart = new Date(dayStart.getTime() + 86400000);

  const rows = await prisma.sickLeave.findMany({
    where: { userId: parsed.data.userId, startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
    orderBy: { startDate: "asc" }
  });
  if (rows.length === 0) {
    res.status(404).json({ message: "Kein Krankheitseintrag fuer diesen Tag gefunden." });
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const startsToday = dayKey(row.startDate) === dayKey(dayStart);
      const endsToday = dayKey(row.endDate) === dayKey(dayStart);
      if (startsToday && endsToday) {
        await tx.sickLeave.delete({ where: { id: row.id } });
        continue;
      }
      if (startsToday && !endsToday) {
        await tx.sickLeave.update({ where: { id: row.id }, data: { startDate: nextDayStart } });
        continue;
      }
      if (!startsToday && endsToday) {
        await tx.sickLeave.update({ where: { id: row.id }, data: { endDate: prevDayEnd } });
        continue;
      }
      await tx.sickLeave.update({ where: { id: row.id }, data: { endDate: prevDayEnd } });
      await tx.sickLeave.create({
        data: {
          userId: row.userId,
          startDate: nextDayStart,
          endDate: row.endDate,
          partialDayHours: row.partialDayHours ?? undefined,
          note: row.note ?? undefined,
          createdById: actorUserId
        }
      });
    }
  });

  await writeAuditLog({
    actorUserId,
    actorLoginName: await resolveActorLoginName(actorUserId),
    action: "SICK_LEAVE_DAY_REMOVED",
    targetType: "SickLeave",
    targetId: parsed.data.userId,
    payload: parsed.data
  });

  res.json({ ok: true });
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
  note: z.string().trim().max(1000)
});

timeRouter.post("/overtime-adjustment", requireRole([Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = overtimeAdjustmentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteOvertimeAdjustment: true } });
  if ((cfg?.requireNoteOvertimeAdjustment ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
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

timeRouter.get("/overtime-adjustment/:userId", requireRole([Role.ADMIN]), async (req, res) => {
  const userId = String(req.params.userId);
  const entries = await prisma.overtimeAdjustment.findMany({ where: { userId }, orderBy: { date: "desc" }, take: 50 });
  res.json(entries);
});

const overtimeAccountSchema = z.object({
  hours: z
    .preprocess((v) => {
      if (typeof v === "number") return v;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    }, z.number().finite("Stunden sind ungueltig.").min(-10000).max(10000)),
  note: z.string().trim().max(1000)
});

timeRouter.get("/overtime-account/:userId", requireRole([Role.ADMIN]), async (req, res) => {
  const userId = String(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, overtimeBalanceHours: true } });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  res.json({ userId: user.id, overtimeBalanceHours: user.overtimeBalanceHours });
});

timeRouter.patch("/overtime-account/:userId", requireRole([Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = overtimeAccountSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: parsed.success ? "Nicht authentifiziert." : zodFirstMessage(parsed) });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteOvertimeAccountSet: true } });
  if ((cfg?.requireNoteOvertimeAccountSet ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const userId = String(req.params.userId);
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { overtimeBalanceHours: true } });
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  const target = parsed.data.hours;
  const delta = Number((target - user.overtimeBalanceHours).toFixed(2));
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { overtimeBalanceHours: target } }),
    prisma.overtimeAdjustment.create({
      data: {
        userId,
        date: now,
        hours: delta,
        reason: `Kontostand gesetzt auf ${target.toFixed(2)} h. ${parsed.data.note}`,
        createdById: req.auth.userId
      }
    })
  ]);
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "OVERTIME_ACCOUNT_SET",
    targetType: "User",
    targetId: userId,
    payload: { oldValue: user.overtimeBalanceHours, newValue: target, delta, note: parsed.data.note }
  });
  res.json({ userId, overtimeBalanceHours: target, delta });
});

const dayOverrideSchema = z.object({
  userId: z.string().min(1),
  date: z.string().min(10),
  note: z.string().max(1000),
  events: z
    .array(
      z.object({
        type: z.nativeEnum(TimeEntryType),
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Zeit ist ungueltig (HH:MM).")
      })
    )
    .min(0)
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
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteSupervisorCorrection: true } });
  if ((cfg?.requireNoteSupervisorCorrection ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const dateParts = parseIsoDateParts(parsed.data.date);
  if (!dateParts) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { timeTrackingEnabled: true } });
  if (target && !target.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
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
    if (created.length > 0) {
      await upsertSpecialWorkApproval(parsed.data.userId, dayStart, parsed.data.note);
    } else {
      await prisma.specialWorkApproval.deleteMany({
        where: { userId: parsed.data.userId, date: dayStart }
      });
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
  note: z.string().max(1000),
  events: z
    .array(
      z.object({
        type: z.nativeEnum(TimeEntryType),
        time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/, "Zeit ist ungueltig (HH:MM).")
      })
    )
    .min(1)
});

const azubiSchoolDaySchema = z.object({
  date: z.string().min(10)
});

timeRouter.post("/azubi/school-day", requireRole([Role.AZUBI]), async (req: AuthRequest, res) => {
  const parsed = azubiSchoolDaySchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const dateParts = parseIsoDateParts(parsed.data.date);
  if (!dateParts) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timeTrackingEnabled: true } });
  if (me && !me.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }

  const now = new Date();
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const selected = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
  const diffDays = Math.floor((todayUtc.getTime() - selected.getTime()) / 86400000);
  if (Number.isNaN(diffDays) || diffDays < 0) {
    res.status(403).json({ message: "Eintrag in die Zukunft ist nicht erlaubt." });
    return;
  }
  if (diffDays > 3) {
    res.status(403).json({ message: "Berufsschule kann nur bis 3 Tage rueckwirkend eingetragen werden." });
    return;
  }

  const dayStart = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 0, 0, 0));
  const dayEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999));
  await prisma.timeEntry.deleteMany({ where: { userId: req.auth.userId, occurredAt: { gte: dayStart, lte: dayEnd } } });

  await prisma.timeEntry.createMany({
    data: [
      {
        userId: req.auth.userId,
        type: TimeEntryType.CLOCK_IN,
        source: TimeEntrySource.MANUAL_CORRECTION,
        isManualCorrection: true,
        correctionComment: "Berufsschule",
        reasonText: "Berufsschule",
        occurredAt: new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 8, 0, 0)),
        createdById: req.auth.userId
      },
      {
        userId: req.auth.userId,
        type: TimeEntryType.CLOCK_OUT,
        source: TimeEntrySource.MANUAL_CORRECTION,
        isManualCorrection: true,
        correctionComment: "Berufsschule",
        reasonText: "Berufsschule",
        occurredAt: new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day, 16, 30, 0)),
        createdById: req.auth.userId
      }
    ]
  });

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "AZUBI_SCHOOL_DAY_SET",
    targetType: "TimeEntry",
    targetId: req.auth.userId,
    payload: { date: parsed.data.date, note: "Berufsschule", workedHoursTarget: 8 }
  });

  res.json({ ok: true });
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
  const cfgNotes = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteSelfCorrection: true } });
  if ((cfgNotes?.requireNoteSelfCorrection ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const me = await prisma.user.findUnique({ where: { id: req.auth.userId }, select: { timeTrackingEnabled: true } });
  if (me && !me.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
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
    await upsertSpecialWorkApproval(req.auth.userId, dayStart, parsed.data.note);
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
  if ((req.auth.role === Role.EMPLOYEE || req.auth.role === Role.AZUBI) && req.auth.userId !== targetUserId) {
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
  const [config, user, holidays, entries, approvals, sickLeaves, credits] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { dailyWorkHours: true, timeTrackingEnabled: true } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId: targetUserId, occurredAt: { gte: monthStart, lte: monthEnd } }, orderBy: { occurredAt: "asc" } }),
    prisma.specialWorkApproval.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.sickLeave.findMany({ where: { userId: targetUserId, startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
    prisma.breakCredit.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } })
  ]);
  const dailyHours = user?.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));
  const approvalByDay = new Map(approvals.map((a) => [dayKey(a.date), a.status]));
  const schoolDaySet = new Set(
    entries
      .filter((e) => isSchoolEntry({ reasonText: e.reasonText, correctionComment: e.correctionComment }))
      .map((e) => dayKey(e.occurredAt))
  );
  const creditByDay = new Map<string, number>();
  for (const c of credits) {
    const key = dayKey(c.date);
    creditByDay.set(key, (creditByDay.get(key) ?? 0) + c.minutes);
  }
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;
  const grossByDay = buildGrossMinutesByStartDay(entries.map((e) => ({ type: e.type, occurredAt: e.occurredAt })));
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
    const isSick = planned > 0 && sickLeaves.some((s) => isDateWithinRange(date, s.startDate, s.endDate));
    const sickHours = isSick ? planned : 0;
    const grossMin = grossByDay.minutesByDay.get(key) ?? 0;
    const autoBreakApplies = grossMin >= breakAfterHours * 60;
    const dayCredit = creditByDay.get(key) ?? 0;
    const netMinutes = Math.max(grossMin - (autoBreakApplies ? breakMinutes : 0) + dayCredit, 0);
    const approvalStatus = approvalByDay.get(key) ?? null;
    const requiresApproval = isHoliday || weekend || ((config?.requireApprovalForCrossMidnight ?? true) && grossByDay.crossMidnightStartDays.has(key));
    const schoolDay = dayEntries.some((e) => isSchoolEntry({ reasonText: e.reasonText, correctionComment: e.correctionComment }));
    const workedRaw = schoolDay ? 8 : Number((netMinutes / 60).toFixed(2));
    const workedEffective = requiresApproval && approvalStatus !== ApprovalStatus.APPROVED ? 0 : workedRaw;
    const worked = user?.timeTrackingEnabled === false
      ? Number(planned.toFixed(2))
      : Number((sickHours > 0 ? sickHours : workedEffective).toFixed(2));
    monthPlanned += planned;
    monthWorked += worked;
    days.push({
      date: key,
      plannedHours: Number(planned.toFixed(2)),
      workedHours: worked,
      sickHours: Number(sickHours.toFixed(2)),
      isSick,
      isHoliday,
      isWeekend: weekend,
      specialWorkApprovalStatus: approvalStatus,
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

function buildGrossMinutesByStartDay(entries: { type: TimeEntryType; occurredAt: Date }[]): {
  minutesByDay: Map<string, number>;
  crossMidnightStartDays: Set<string>;
} {
  const sorted = [...entries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const minutesByDay = new Map<string, number>();
  const crossMidnightStartDays = new Set<string>();
  let openClockIn: Date | null = null;
  for (const e of sorted) {
    if (e.type === TimeEntryType.CLOCK_IN) {
      openClockIn = e.occurredAt;
      continue;
    }
    if (e.type === TimeEntryType.CLOCK_OUT && openClockIn) {
      const diffMs = e.occurredAt.getTime() - openClockIn.getTime();
      if (diffMs > 0) {
        const startKey = dayKey(openClockIn);
        minutesByDay.set(startKey, (minutesByDay.get(startKey) ?? 0) + Math.floor(diffMs / 60000));
        if (dayKey(e.occurredAt) !== startKey) {
          crossMidnightStartDays.add(startKey);
        }
      }
      openClockIn = null;
    }
  }
  return { minutesByDay, crossMidnightStartDays };
}

function isSchoolEntry(entry: { reasonText?: string | null; correctionComment?: string | null }): boolean {
  const reason = String(entry.reasonText || entry.correctionComment || "").trim().toLowerCase();
  return reason === "berufsschule";
}

timeRouter.get("/summary/:userId", requireRole([Role.EMPLOYEE, Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  if (!req.auth) {
    res.status(401).json({ message: "Nicht authentifiziert." });
    return;
  }

  const targetUserId = String(req.params.userId);
  if ((req.auth.role === Role.EMPLOYEE || req.auth.role === Role.AZUBI) && req.auth.userId !== targetUserId) {
    res.status(403).json({ message: "Keine Berechtigung." });
    return;
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [config, user, holidays, entries, credits, sickLeaves, leaveRequests, overtimeAdjustments, approvals] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { dailyWorkHours: true, overtimeBalanceHours: true, timeTrackingEnabled: true } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { userId: targetUserId, occurredAt: { gte: monthStart, lte: monthEnd } } }),
    prisma.breakCredit.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.sickLeave.findMany({ where: { userId: targetUserId, startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
    prisma.leaveRequest.findMany({ where: { userId: targetUserId, status: "APPROVED", startDate: { lte: monthEnd }, endDate: { gte: monthStart } } }),
    prisma.overtimeAdjustment.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } }),
    prisma.specialWorkApproval.findMany({ where: { userId: targetUserId, date: { gte: monthStart, lte: monthEnd } } })
  ]);

  const dailyHours = user?.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;

  const grossByDay = buildGrossMinutesByStartDay(entries.map((entry) => ({ type: entry.type, occurredAt: entry.occurredAt })));

  const creditByDay = new Map<string, number>();
  for (const c of credits) {
    const key = dayKey(c.date);
    creditByDay.set(key, (creditByDay.get(key) ?? 0) + c.minutes);
  }

  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));
  const approvalByDay = new Map(approvals.map((a) => [dayKey(a.date), a.status]));
  const schoolDaySet = new Set(
    entries
      .filter((e) => isSchoolEntry({ reasonText: e.reasonText, correctionComment: e.correctionComment }))
      .map((e) => dayKey(e.occurredAt))
  );

  let workedTotal = 0;
  let expectedTotal = 0;

  for (let day = 1; day <= monthEnd.getUTCDate(); day += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
    const key = dayKey(date);
    const grossMinutes = grossByDay.minutesByDay.get(key) ?? 0;
    const autoBreakApplies = grossMinutes >= breakAfterHours * 60;
    const dayCredit = creditByDay.get(key) ?? 0;
    const netMinutes = Math.max(grossMinutes - (autoBreakApplies ? breakMinutes : 0) + dayCredit, 0);

    const isHoliday = holidaySet.has(key);
    const weekend = isWeekend(date);
    const isSick = !weekend && !isHoliday && sickLeaves.some((s) => isDateWithinRange(date, s.startDate, s.endDate));
    const isSchoolDay = schoolDaySet.has(key);
    const approvalStatus = approvalByDay.get(key) ?? null;
    const requiresApproval = isHoliday || weekend || ((config?.requireApprovalForCrossMidnight ?? true) && grossByDay.crossMidnightStartDays.has(key));
    if (isSchoolDay) {
      workedTotal += 8;
    } else if (isSick) {
      workedTotal += dailyHours;
    } else if (!requiresApproval || approvalStatus === ApprovalStatus.APPROVED) {
      workedTotal += netMinutes / 60;
    }

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

  const sickHours = sickLeaves.reduce((sum, s) => {
    const start = new Date(Math.max(s.startDate.getTime(), monthStart.getTime()));
    const end = new Date(Math.min(s.endDate.getTime(), monthEnd.getTime()));
    let hours = 0;
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); d <= end; d = new Date(d.getTime() + 86400000)) {
      const key = dayKey(d);
      const isWorkday = workingDays.has(d.getUTCDay()) && !holidaySet.has(key);
      if (isWorkday) hours += dailyHours;
    }
    return sum + hours;
  }, 0);

  const manualAdjustmentHours = overtimeAdjustments.reduce((sum, a) => sum + a.hours, 0);
  const totalIncludingAbsence = workedTotal + approvalDays * dailyHours + sickHours;
  if (user?.timeTrackingEnabled === false) {
    res.json({
      month: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
      plannedHours: Number(expectedTotal.toFixed(2)),
      workedHours: Number(expectedTotal.toFixed(2)),
      overtimeHours: Number((user?.overtimeBalanceHours ?? 0).toFixed(2)),
      manualAdjustmentHours: Number(manualAdjustmentHours.toFixed(2)),
      longShiftAlert: false
    });
    return;
  }

  const overtime = (user?.overtimeBalanceHours ?? 0) + (totalIncludingAbsence - expectedTotal + manualAdjustmentHours);

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
  if ((req.auth.role === Role.EMPLOYEE || req.auth.role === Role.AZUBI) && req.auth.userId !== targetUserId) {
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

timeRouter.get("/today-overview", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req: AuthRequest, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const entries = await prisma.timeEntry.findMany({
    where: { occurredAt: { gte: start, lte: end } },
    orderBy: { occurredAt: "asc" },
    include: { user: { select: { id: true, name: true, loginName: true } } }
  });

  res.json(entries.map((e) => ({
    id: e.id,
    userId: e.userId,
    userName: e.user.name,
    loginName: e.user.loginName,
    type: e.type,
    occurredAt: e.occurredAt,
    source: e.source,
    reasonText: e.reasonText || null
  })));
});

const bulkEntrySchema = z.object({
  userId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Startdatum ist ungueltig."),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enddatum ist ungueltig."),
  clockIn: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Kommen ist ungueltig."),
  clockOut: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Gehen ist ungueltig."),
  note: z.string().trim().min(1, "Notiz ist Pflicht.")
});

timeRouter.post("/bulk-entry", requireRole([Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = bulkEntrySchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: parsed.success ? "Nicht authentifiziert." : zodFirstMessage(parsed) });
    return;
  }

  const startParts = parseIsoDateParts(parsed.data.startDate);
  const endParts = parseIsoDateParts(parsed.data.endDate);
  const inParts = parseTimeParts(parsed.data.clockIn);
  const outParts = parseTimeParts(parsed.data.clockOut);
  if (!startParts || !endParts || !inParts || !outParts) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const startDate = new Date(Date.UTC(startParts.year, startParts.month - 1, startParts.day, 0, 0, 0));
  const endDate = new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day, 23, 59, 59, 999));
  if (endDate < startDate) {
    res.status(400).json({ message: "Enddatum muss >= Startdatum sein." });
    return;
  }

  const dailyStartMinutes = inParts.hour * 60 + inParts.minute;
  const dailyEndMinutes = outParts.hour * 60 + outParts.minute;
  if (dailyEndMinutes <= dailyStartMinutes) {
    res.status(400).json({ message: "Gehen muss nach Kommen liegen." });
    return;
  }

  const [config, holidays, user] = await Promise.all([
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.holiday.findMany({ where: { date: { gte: startDate, lte: endDate } }, select: { date: true } }),
    prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, timeTrackingEnabled: true } })
  ]);
  if (!user) {
    res.status(404).json({ message: "Mitarbeiter nicht gefunden." });
    return;
  }
  if (!user.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }

  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const holidaySet = new Set(holidays.map((h) => dayKey(h.date)));
  const daysInRange = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  if (daysInRange > 366) {
    res.status(400).json({ message: "Zeitraum zu gross (max. 366 Tage)." });
    return;
  }

  const existingEntries = await prisma.timeEntry.findMany({
    where: { userId: parsed.data.userId, occurredAt: { gte: startDate, lte: endDate } },
    select: { occurredAt: true }
  });
  const occupiedDayKeys = new Set(existingEntries.map((e) => dayKey(e.occurredAt)));

  const createRows: Array<{ userId: string; type: TimeEntryType; source: TimeEntrySource; isManualCorrection: boolean; correctionComment: string; reasonText: string; occurredAt: Date; createdById: string }> = [];
  const insertedDates: string[] = [];
  const skippedDates: string[] = [];

  for (let d = new Date(startDate); d <= endDate; d = new Date(d.getTime() + 86400000)) {
    const k = dayKey(d);
    const isWorkday = workingDays.has(d.getUTCDay()) && !holidaySet.has(k);
    if (!isWorkday) continue;
    if (occupiedDayKeys.has(k)) {
      skippedDates.push(k);
      continue;
    }

    const inAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), inParts.hour, inParts.minute, 0));
    const outAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), outParts.hour, outParts.minute, 0));
    const correctionComment = `Stapelerfassung: ${parsed.data.note}`;
    createRows.push(
      {
        userId: parsed.data.userId,
        type: TimeEntryType.CLOCK_IN,
        source: TimeEntrySource.MANUAL_CORRECTION,
        isManualCorrection: true,
        correctionComment,
        reasonText: correctionComment,
        occurredAt: inAt,
        createdById: req.auth.userId
      },
      {
        userId: parsed.data.userId,
        type: TimeEntryType.CLOCK_OUT,
        source: TimeEntrySource.MANUAL_CORRECTION,
        isManualCorrection: true,
        correctionComment,
        reasonText: correctionComment,
        occurredAt: outAt,
        createdById: req.auth.userId
      }
    );
    insertedDates.push(k);
  }

  if (createRows.length > 0) {
    await prisma.timeEntry.createMany({ data: createRows });
  }

  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: "BULK_TIME_ENTRY_CREATED",
    targetType: "User",
    targetId: parsed.data.userId,
    payload: {
      startDate: parsed.data.startDate,
      endDate: parsed.data.endDate,
      clockIn: parsed.data.clockIn,
      clockOut: parsed.data.clockOut,
      insertedDays: insertedDates.length,
      skippedDays: skippedDates.length,
      note: parsed.data.note
    }
  });

  const grossHoursPerDay = Number(((dailyEndMinutes - dailyStartMinutes) / 60).toFixed(2));
  res.json({
    insertedDays: insertedDates.length,
    skippedDays: skippedDates.length,
    insertedDates,
    skippedDates,
    grossHoursPerDay
  });
});

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ist ungueltig."),
  name: z.string().trim().min(1, "Name ist Pflicht.")
});

const holidayUpdateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Datum ist ungueltig.").optional(),
  name: z.string().trim().min(1, "Name ist Pflicht.").optional()
});

timeRouter.get("/holidays", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const holidays = await prisma.holiday.findMany({ orderBy: { date: "asc" } });
  res.json(holidays.map((h) => ({ id: h.id, date: h.date.toISOString().slice(0, 10), name: h.name })));
});

timeRouter.post("/holidays", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  const p = parseIsoDateParts(parsed.data.date);
  if (!p) {
    res.status(400).json({ message: "Datum ist ungueltig." });
    return;
  }
  const holidayDate = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  try {
    const holiday = await prisma.holiday.create({ data: { date: holidayDate, name: parsed.data.name } });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "HOLIDAY_CREATED",
      targetType: "Holiday",
      targetId: holiday.id,
      payload: parsed.data
    });
    res.status(201).json({ id: holiday.id, date: holiday.date.toISOString().slice(0, 10), name: holiday.name });
  } catch {
    res.status(409).json({ message: "Feiertag existiert bereits." });
  }
});

timeRouter.patch("/holidays/:id", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = holidayUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: zodFirstMessage(parsed) });
    return;
  }
  if (!parsed.data.date && !parsed.data.name) {
    res.status(400).json({ message: "Keine Aenderung uebergeben." });
    return;
  }
  const holidayId = String(req.params.id);
  const data: { date?: Date; name?: string } = {};
  if (parsed.data.date) {
    const p = parseIsoDateParts(parsed.data.date);
    if (!p) {
      res.status(400).json({ message: "Datum ist ungueltig." });
      return;
    }
    data.date = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  }
  if (parsed.data.name) {
    data.name = parsed.data.name;
  }
  try {
    const updated = await prisma.holiday.update({ where: { id: holidayId }, data });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "HOLIDAY_UPDATED",
      targetType: "Holiday",
      targetId: updated.id,
      payload: parsed.data
    });
    res.json({ id: updated.id, date: updated.date.toISOString().slice(0, 10), name: updated.name });
  } catch {
    res.status(400).json({ message: "Feiertag konnte nicht aktualisiert werden." });
  }
});

timeRouter.delete("/holidays/:id", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const holidayId = String(req.params.id);
  try {
    await prisma.holiday.delete({ where: { id: holidayId } });
    await writeAuditLog({
      actorUserId: req.auth?.userId,
      actorLoginName: await resolveActorLoginName(req.auth?.userId),
      action: "HOLIDAY_DELETED",
      targetType: "Holiday",
      targetId: holidayId
    });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ message: "Feiertag nicht gefunden." });
  }
});

timeRouter.get("/special-work/pending", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req, res) => {
  const pending = await prisma.specialWorkApproval.findMany({
    where: { status: ApprovalStatus.SUBMITTED },
    include: { user: { select: { id: true, name: true, loginName: true } } },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }]
  });
  const minDate = pending[0]?.date;
  const maxDate = pending[pending.length - 1]?.date;
  const [entries, credits, cfg] = await Promise.all([
    minDate && maxDate
      ? prisma.timeEntry.findMany({
          where: {
            userId: { in: Array.from(new Set(pending.map((p) => p.userId))) },
            occurredAt: {
              gte: new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate(), 0, 0, 0)),
              lte: new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59, 999))
            }
          },
          orderBy: { occurredAt: "asc" }
        })
      : Promise.resolve([]),
    minDate && maxDate
      ? prisma.breakCredit.findMany({
          where: {
            userId: { in: Array.from(new Set(pending.map((p) => p.userId))) },
            date: {
              gte: new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate(), 0, 0, 0)),
              lte: new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59, 999))
            }
          }
        })
      : Promise.resolve([]),
    prisma.systemConfig.findUnique({ where: { id: 1 }, select: { autoBreakMinutes: true, autoBreakAfterHours: true } })
  ]);
  const breakMinutes = cfg?.autoBreakMinutes ?? 30;
  const breakAfterHours = cfg?.autoBreakAfterHours ?? 6;
  const entriesByUserDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const key = `${e.userId}:${dayKey(e.occurredAt)}`;
    const list = entriesByUserDay.get(key) ?? [];
    list.push(e);
    entriesByUserDay.set(key, list);
  }
  const creditsByUserDay = new Map<string, number>();
  for (const c of credits) {
    const key = `${c.userId}:${dayKey(c.date)}`;
    creditsByUserDay.set(key, (creditsByUserDay.get(key) ?? 0) + c.minutes);
  }
  res.json(
    pending.map((p) => ({
      ...((): { clockInTimes: string[]; clockOutTimes: string[]; workedHours: number } => {
        const key = `${p.userId}:${dayKey(p.date)}`;
        const dayEntries = (entriesByUserDay.get(key) ?? []).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
        const grossMinutes = calculateWorkedMinutes(dayEntries.map((e) => ({ type: e.type, occurredAt: e.occurredAt })));
        const autoBreakApplies = grossMinutes >= breakAfterHours * 60;
        const credit = creditsByUserDay.get(key) ?? 0;
        const netMinutes = Math.max(grossMinutes - (autoBreakApplies ? breakMinutes : 0) + credit, 0);
        return {
          clockInTimes: dayEntries.filter((e) => e.type === TimeEntryType.CLOCK_IN).map((e) => e.occurredAt.toISOString().slice(11, 16)),
          clockOutTimes: dayEntries.filter((e) => e.type === TimeEntryType.CLOCK_OUT).map((e) => e.occurredAt.toISOString().slice(11, 16)),
          workedHours: Number((netMinutes / 60).toFixed(2))
        };
      })(),
      ...p,
      date: p.date.toISOString().slice(0, 10),
      createdAt: p.createdAt.toISOString(),
      eventType:
        (p.note || "").toLowerCase().includes("0:00")
          ? "Arbeit ueber 0:00"
          : "Arbeit Feiertag/Wochenende"
    }))
  );
});

const specialDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(1000)
});

timeRouter.post("/special-work/decision", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (req: AuthRequest, res) => {
  const parsed = specialDecisionSchema.safeParse(req.body);
  if (!parsed.success || !req.auth) {
    res.status(400).json({ message: parsed.success ? "Nicht authentifiziert." : zodFirstMessage(parsed) });
    return;
  }
  const cfg = await prisma.systemConfig.findUnique({ where: { id: 1 }, select: { requireNoteSupervisorCorrection: true } });
  if ((cfg?.requireNoteSupervisorCorrection ?? true) && !parsed.data.note.trim()) {
    res.status(400).json({ message: "Notiz ist Pflicht." });
    return;
  }
  const updated = await prisma.specialWorkApproval.update({
    where: { id: parsed.data.approvalId },
    data: {
      status: parsed.data.decision as ApprovalStatus,
      note: parsed.data.note,
      decidedAt: new Date(),
      decidedById: req.auth.userId
    }
  });
  await writeAuditLog({
    actorUserId: req.auth.userId,
    actorLoginName: await resolveActorLoginName(req.auth.userId),
    action: parsed.data.decision === "APPROVED" ? "SPECIAL_WORK_APPROVED" : "SPECIAL_WORK_REJECTED",
    targetType: "SpecialWorkApproval",
    targetId: updated.id,
    payload: parsed.data
  });
  res.json({ id: updated.id, status: updated.status });
});

timeRouter.get("/supervisor-overview", requireRole([Role.SUPERVISOR, Role.ADMIN]), async (_req: AuthRequest, res) => {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59));

  const [users, config, holidaysAll, entries, credits, approvals, sickLeaves] = await Promise.all([
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, dailyWorkHours: true, overtimeBalanceHours: true, timeTrackingEnabled: true }
    }),
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
    prisma.holiday.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.timeEntry.findMany({ where: { occurredAt: { gte: monthStart, lte: monthEnd } } }),
    prisma.breakCredit.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.specialWorkApproval.findMany({ where: { date: { gte: monthStart, lte: monthEnd } } }),
    prisma.sickLeave.findMany({ where: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } }, select: { userId: true, startDate: true, endDate: true } })
  ]);

  const workingDays = parseWorkingDaySet(config?.defaultWeeklyWorkingDays);
  const holidaySet = new Set(holidaysAll.map((h) => dayKey(h.date)));
  const autoBreakMinutes = config?.autoBreakMinutes ?? 30;
  const autoBreakAfterHours = config?.autoBreakAfterHours ?? 6;

  const entriesByUser = new Map<string, { type: TimeEntryType; occurredAt: Date; reasonText?: string | null; correctionComment?: string | null }[]>();
  for (const entry of entries) {
    const list = entriesByUser.get(entry.userId) ?? [];
    list.push({ type: entry.type, occurredAt: entry.occurredAt, reasonText: entry.reasonText, correctionComment: entry.correctionComment });
    entriesByUser.set(entry.userId, list);
  }

  const creditsByUserDay = new Map<string, number>();
  for (const credit of credits) {
    const key = `${credit.userId}:${dayKey(credit.date)}`;
    creditsByUserDay.set(key, (creditsByUserDay.get(key) ?? 0) + credit.minutes);
  }

  const approvalByUserDay = new Map<string, ApprovalStatus>();
  for (const approval of approvals) {
    const key = `${approval.userId}:${dayKey(approval.date)}`;
    approvalByUserDay.set(key, approval.status);
  }
  const sickByUser = new Map<string, Array<{ startDate: Date; endDate: Date }>>();
  for (const s of sickLeaves) {
    const list = sickByUser.get(s.userId) ?? [];
    list.push({ startDate: s.startDate, endDate: s.endDate });
    sickByUser.set(s.userId, list);
  }

  let monthPlannedHours = 0;
  const monthLabelDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const monthLabelRaw = monthLabelDate.toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
  const monthLabel = monthLabelRaw.charAt(0).toUpperCase() + monthLabelRaw.slice(1);

  for (let d = new Date(monthStart); d <= monthEnd; d = new Date(d.getTime() + 86400000)) {
    const isWorkday = workingDays.has(d.getUTCDay()) && !holidaySet.has(dayKey(d));
    if (isWorkday) {
      monthPlannedHours += config?.defaultDailyHours ?? 8;
    }
  }

  const rows = users.map((u) => {
    const dailyHours = u.dailyWorkHours ?? config?.defaultDailyHours ?? 8;
    const userEntries = entriesByUser.get(u.id) ?? [];
    const grossByDay = buildGrossMinutesByStartDay(userEntries);
    const schoolDaySet = new Set(
      userEntries
        .filter((e) => isSchoolEntry({ reasonText: e.reasonText, correctionComment: e.correctionComment }))
        .map((e) => dayKey(e.occurredAt))
    );
    let requiredCurrentMonthHours = 0;
    let workedCurrentMonthHours = 0;

    for (let d = new Date(monthStart); d <= monthEnd; d = new Date(d.getTime() + 86400000)) {
      const k = dayKey(d);
      const isWorkday = workingDays.has(d.getUTCDay()) && !holidaySet.has(k);
      const planned = isWorkday ? dailyHours : 0;
      requiredCurrentMonthHours += planned;

      const grossMinutes = grossByDay.minutesByDay.get(k) ?? 0;
      const autoBreakApplies = grossMinutes >= autoBreakAfterHours * 60;
      const creditMinutes = creditsByUserDay.get(`${u.id}:${k}`) ?? 0;
      const netMinutes = Math.max(grossMinutes - (autoBreakApplies ? autoBreakMinutes : 0) + creditMinutes, 0);

      const isHoliday = holidaySet.has(k);
      const weekend = isWeekend(d);
      const requiresApproval = isHoliday || weekend || ((config?.requireApprovalForCrossMidnight ?? true) && grossByDay.crossMidnightStartDays.has(k));
      const approvalStatus = approvalByUserDay.get(`${u.id}:${k}`) ?? null;
      const sickForDay = (sickByUser.get(u.id) ?? []).some((s) => isDateWithinRange(d, s.startDate, s.endDate));
      const sickHoursForDay = planned > 0 && sickForDay ? planned : 0;
      if (schoolDaySet.has(k)) {
        workedCurrentMonthHours += 8;
      } else if (sickHoursForDay > 0) {
        workedCurrentMonthHours += sickHoursForDay;
      } else if (!requiresApproval || approvalStatus === ApprovalStatus.APPROVED) {
        workedCurrentMonthHours += netMinutes / 60;
      } else {
        workedCurrentMonthHours += 0;
      }
    }

    if (u.timeTrackingEnabled === false) {
      workedCurrentMonthHours = requiredCurrentMonthHours;
    }

    return {
      userId: u.id,
      istHours: Number(workedCurrentMonthHours.toFixed(2)),
      sollHours: Number(requiredCurrentMonthHours.toFixed(2)),
      overtimeHours: Number((u.overtimeBalanceHours ?? 0).toFixed(2))
    };
  });

  res.json({
    monthLabel,
    monthPlannedHours: Number(monthPlannedHours.toFixed(2)),
    rows
  });
});

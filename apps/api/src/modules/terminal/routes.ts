import { ApprovalStatus, TimeEntrySource, TimeEntryType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";
import { writeAuditLog } from "../../utils/audit.js";

export const terminalRouter = Router();

function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function dayStartUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0));
}

function dayEndUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function lastSundayOfMonthUtc(year: number, monthIndex: number): Date {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0, 0, 0, 0, 0));
  const dow = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() - dow);
  return d;
}

function isBerlinDstAtUtc(date: Date): boolean {
  const y = date.getUTCFullYear();
  const startDay = lastSundayOfMonthUtc(y, 2); // March
  const endDay = lastSundayOfMonthUtc(y, 9); // October
  const start = new Date(Date.UTC(y, 2, startDay.getUTCDate(), 1, 0, 0)); // 01:00 UTC
  const end = new Date(Date.UTC(y, 9, endDay.getUTCDate(), 1, 0, 0)); // 01:00 UTC
  return date >= start && date < end;
}

function formatBerlinTime(date: Date): string {
  const offsetHours = isBerlinDstAtUtc(date) ? 2 : 1;
  const local = new Date(date.getTime() + offsetHours * 3600000);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

function calculateWorkedMinutes(entries: { type: TimeEntryType; occurredAt: Date }[]): number {
  const sorted = [...entries].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  let currentIn: Date | null = null;
  let minutes = 0;
  for (const e of sorted) {
    if (e.type === TimeEntryType.CLOCK_IN) {
      currentIn = e.occurredAt;
      continue;
    }
    if (e.type === TimeEntryType.CLOCK_OUT && currentIn) {
      minutes += Math.max(0, Math.floor((e.occurredAt.getTime() - currentIn.getTime()) / 60000));
      currentIn = null;
    }
  }
  return minutes;
}

async function computeWorkedTodayHours(userId: string, dayStart: Date, dayEnd: Date): Promise<number> {
  const [dayEntries, breakCredits, config] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, occurredAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { occurredAt: "asc" },
      select: { type: true, occurredAt: true }
    }),
    prisma.breakCredit.findMany({
      where: { userId, date: { gte: dayStart, lte: dayEnd } },
      select: { minutes: true }
    }),
    prisma.systemConfig.findUnique({ where: { id: 1 }, select: { autoBreakMinutes: true, autoBreakAfterHours: true } })
  ]);
  const grossMinutes = calculateWorkedMinutes(dayEntries);
  const breakMinutes = config?.autoBreakMinutes ?? 30;
  const breakAfterHours = config?.autoBreakAfterHours ?? 6;
  const autoBreakApplies = grossMinutes >= breakAfterHours * 60;
  const creditMinutes = breakCredits.reduce((sum, c) => sum + c.minutes, 0);
  const netMinutes = Math.max(grossMinutes - (autoBreakApplies ? breakMinutes : 0) + creditMinutes, 0);
  return Number((netMinutes / 60).toFixed(2));
}

const punchSchema = z.object({
  terminalKey: z.string().min(16),
  rfidTag: z.string().min(1),
  type: z.nativeEnum(TimeEntryType).optional(),
  reasonText: z.string().max(255).optional()
});

const nextTypeSchema = z.object({
  terminalKey: z.string().min(16),
  rfidTag: z.string().min(1)
});

terminalRouter.post("/next-type", async (req, res) => {
  const parsed = nextTypeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }
  const terminal = await prisma.rfidTerminal.findUnique({ where: { apiKey: parsed.data.terminalKey } });
  if (!terminal || !terminal.isActive) {
    res.status(401).json({ message: "Terminal nicht autorisiert oder deaktiviert." });
    return;
  }
  const user = await prisma.user.findFirst({
    where: { rfidTag: parsed.data.rfidTag, isActive: true },
    select: { id: true, name: true, timeTrackingEnabled: true }
  });
  if (!user) {
    res.status(404).json({ message: "RFID nicht zugeordnet." });
    return;
  }
  if (!user.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }
  const lastEntry = await prisma.timeEntry.findFirst({
    where: { userId: user.id },
    orderBy: { occurredAt: "desc" },
    select: { type: true, occurredAt: true, source: true }
  });
  const nextType = lastEntry?.type === TimeEntryType.CLOCK_IN ? TimeEntryType.CLOCK_OUT : TimeEntryType.CLOCK_IN;
  const blockedDuplicate = !!(lastEntry && lastEntry.source === TimeEntrySource.RFID && Date.now() - lastEntry.occurredAt.getTime() < 30_000);
  const displayTime = formatBerlinTime(new Date());
  res.json({ nextType, blockedDuplicate, employeeName: user.name, displayTime });
});

terminalRouter.post("/punch", async (req, res) => {
  const parsed = punchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Ungueltige Eingaben." });
    return;
  }

  const terminal = await prisma.rfidTerminal.findUnique({
    where: { apiKey: parsed.data.terminalKey }
  });

  if (!terminal || !terminal.isActive) {
    res.status(401).json({ message: "Terminal nicht autorisiert oder deaktiviert." });
    return;
  }

  const user = await prisma.user.findFirst({
    where: { rfidTag: parsed.data.rfidTag, isActive: true },
    select: { id: true, name: true, timeTrackingEnabled: true }
  });

  if (!user) {
    await writeAuditLog({
      actorLoginName: `terminal:${terminal.name}`,
      action: "RFID_UNASSIGNED_SCAN",
      targetType: "RfidTerminal",
      targetId: terminal.id,
      payload: {
        rfidTag: parsed.data.rfidTag,
        type: parsed.data.type ?? null,
        reasonText: parsed.data.reasonText ?? null,
        terminalId: terminal.id,
        terminalName: terminal.name,
        scannedAt: new Date().toISOString()
      }
    });
    await prisma.rfidTerminal.update({
      where: { id: terminal.id },
      data: { lastSeenAt: new Date() }
    });
    res.status(404).json({ message: "RFID nicht zugeordnet." });
    return;
  }
  if (!user.timeTrackingEnabled) {
    res.status(403).json({ message: "Zeiterfassung ist fuer diesen Mitarbeiter deaktiviert." });
    return;
  }

  const now = new Date();
  const lockKey = `rfid:${user.id}`;
  const txResult = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT GET_LOCK(${lockKey}, 5)`;
    try {
      const lastEntry = await tx.timeEntry.findFirst({
        where: { userId: user.id },
        orderBy: { occurredAt: "desc" },
        select: { type: true, source: true, occurredAt: true, id: true }
      });
      if (lastEntry && lastEntry.source === TimeEntrySource.RFID && now.getTime() - lastEntry.occurredAt.getTime() < 30_000) {
        return { duplicate: true as const, lastEntry };
      }
      const effectiveType: TimeEntryType = lastEntry?.type === TimeEntryType.CLOCK_IN ? TimeEntryType.CLOCK_OUT : TimeEntryType.CLOCK_IN;
      const entry = await tx.timeEntry.create({
        data: {
          userId: user.id,
          type: effectiveType,
          source: TimeEntrySource.RFID,
          reasonText: parsed.data.reasonText,
          occurredAt: now
        }
      });
      return { duplicate: false as const, entry, effectiveType };
    } finally {
      await tx.$queryRaw`DO RELEASE_LOCK(${lockKey})`;
    }
  });

  if (txResult.duplicate) {
    const dayStart = dayStartUtc(now);
    const dayEnd = dayEndUtc(now);
    const workedTodayHours = await computeWorkedTodayHours(user.id, dayStart, dayEnd);
    const displayTime = formatBerlinTime(now);
    res.status(200).json({
      ok: true,
      ignoredDuplicate: true,
      terminalId: terminal.id,
      entryId: txResult.lastEntry.id,
      occurredAt: txResult.lastEntry.occurredAt,
      employeeName: user.name,
      action: txResult.lastEntry.type === TimeEntryType.CLOCK_IN ? "KOMMEN" : "GEHEN",
      workedTodayHours,
      displayTime
    });
    return;
  }
  const entry = txResult.entry;
  const effectiveType = txResult.effectiveType;

  const dayStart = dayStartUtc(entry.occurredAt);
  const dayEnd = dayEndUtc(entry.occurredAt);
  const isHoliday = await prisma.holiday.findFirst({
    where: { date: { gte: dayStart, lte: dayEnd } },
    select: { id: true }
  });
  if (isHoliday || isWeekendUtc(entry.occurredAt)) {
    await prisma.specialWorkApproval.upsert({
      where: { userId_date: { userId: user.id, date: dayStart } },
      create: { userId: user.id, date: dayStart, status: ApprovalStatus.SUBMITTED, note: parsed.data.reasonText ?? "RFID Buchung" },
      update: { status: ApprovalStatus.SUBMITTED, note: parsed.data.reasonText ?? "RFID Buchung", decidedAt: null, decidedById: null }
    });
  }

  await prisma.rfidTerminal.update({
    where: { id: terminal.id },
    data: { lastSeenAt: new Date() }
  });

  const workedTodayHours = await computeWorkedTodayHours(user.id, dayStart, dayEnd);
  const displayTime = formatBerlinTime(now);

  res.status(201).json({
    ok: true,
    terminalId: terminal.id,
    entryId: entry.id,
    occurredAt: entry.occurredAt,
    employeeName: user.name,
    action: effectiveType === TimeEntryType.CLOCK_IN ? "KOMMEN" : "GEHEN",
    workedTodayHours,
    displayTime
  });
});

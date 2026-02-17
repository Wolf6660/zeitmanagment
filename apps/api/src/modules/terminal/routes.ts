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

const punchSchema = z.object({
  terminalKey: z.string().min(16),
  rfidTag: z.string().min(1),
  type: z.nativeEnum(TimeEntryType).optional(),
  reasonText: z.string().max(255).optional()
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

  const lastEntry = await prisma.timeEntry.findFirst({
    where: { userId: user.id },
    orderBy: { occurredAt: "desc" },
    select: { type: true }
  });
  const effectiveType: TimeEntryType = lastEntry?.type === TimeEntryType.CLOCK_IN ? TimeEntryType.CLOCK_OUT : TimeEntryType.CLOCK_IN;

  const entry = await prisma.timeEntry.create({
    data: {
      userId: user.id,
      type: effectiveType,
      source: TimeEntrySource.RFID,
      reasonText: parsed.data.reasonText,
      occurredAt: new Date()
    }
  });

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

  const [dayEntries, breakCredits, config] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId: user.id, occurredAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { occurredAt: "asc" },
      select: { type: true, occurredAt: true }
    }),
    prisma.breakCredit.findMany({
      where: { userId: user.id, date: { gte: dayStart, lte: dayEnd } },
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
  const workedTodayHours = Number((netMinutes / 60).toFixed(2));

  res.status(201).json({
    ok: true,
    terminalId: terminal.id,
    entryId: entry.id,
    occurredAt: entry.occurredAt,
    employeeName: user.name,
    action: effectiveType === TimeEntryType.CLOCK_IN ? "KOMMEN" : "GEHEN",
    workedTodayHours
  });
});

import { ApprovalStatus, TimeEntryType } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../db/prisma.js";

export const terminalRouter = Router();

function isWeekendUtc(date: Date): boolean {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

const punchSchema = z.object({
  terminalKey: z.string().min(16),
  rfidTag: z.string().min(1),
  type: z.nativeEnum(TimeEntryType),
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
    select: { id: true }
  });

  if (!user) {
    res.status(404).json({ message: "RFID nicht zugeordnet." });
    return;
  }

  const entry = await prisma.timeEntry.create({
    data: {
      userId: user.id,
      type: parsed.data.type,
      source: "RFID",
      reasonText: parsed.data.reasonText,
      occurredAt: new Date()
    }
  });

  const isHoliday = await prisma.holiday.findFirst({
    where: {
      date: {
        gte: new Date(Date.UTC(entry.occurredAt.getUTCFullYear(), entry.occurredAt.getUTCMonth(), entry.occurredAt.getUTCDate(), 0, 0, 0)),
        lte: new Date(Date.UTC(entry.occurredAt.getUTCFullYear(), entry.occurredAt.getUTCMonth(), entry.occurredAt.getUTCDate(), 23, 59, 59, 999))
      }
    },
    select: { id: true }
  });
  if (isHoliday || isWeekendUtc(entry.occurredAt)) {
    const dayStart = new Date(Date.UTC(entry.occurredAt.getUTCFullYear(), entry.occurredAt.getUTCMonth(), entry.occurredAt.getUTCDate(), 0, 0, 0));
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

  res.status(201).json({
    ok: true,
    terminalId: terminal.id,
    entryId: entry.id,
    occurredAt: entry.occurredAt
  });
});

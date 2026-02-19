import { prisma } from "../db/prisma.js";
import { writeAuditLog } from "../utils/audit.js";
import { type BackupMode, writeBackupToFile } from "../utils/backup.js";

let started = false;
let running = false;

function parseDays(raw?: string | null): Set<string> {
  const source = (raw || "MON").toUpperCase();
  return new Set(source.split(",").map((v) => v.trim()).filter(Boolean));
}

function dayCodeFromLocalDate(d: Date): string {
  const codes = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return codes[d.getDay()] || "MON";
}

function normalizeMode(raw?: string | null): BackupMode {
  const v = String(raw || "EMPLOYEES_TIMES_ONLY").toUpperCase();
  if (v === "FULL" || v === "SETTINGS_ONLY" || v === "EMPLOYEES_TIMES_ONLY") return v;
  return "EMPLOYEES_TIMES_ONLY";
}

export function startAutoBackupScheduler(): void {
  if (started) return;
  started = true;

  setInterval(async () => {
    if (running) return;
    running = true;
    try {
      const cfg = await prisma.systemConfig.findUnique({
        where: { id: 1 },
        select: {
          autoBackupEnabled: true,
          autoBackupDays: true,
          autoBackupTime: true,
          autoBackupMode: true,
          autoBackupDirectory: true,
          autoBackupLastRunAt: true
        }
      });
      if (!cfg?.autoBackupEnabled) return;

      const now = new Date();
      const day = dayCodeFromLocalDate(now);
      const days = parseDays(cfg.autoBackupDays);
      if (!days.has(day)) return;

      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const nowHm = `${hh}:${mm}`;
      if (nowHm !== String(cfg.autoBackupTime || "02:00")) return;

      const last = cfg.autoBackupLastRunAt;
      if (last) {
        const lastHm = `${String(last.getHours()).padStart(2, "0")}:${String(last.getMinutes()).padStart(2, "0")}`;
        const sameDay =
          last.getFullYear() === now.getFullYear() &&
          last.getMonth() === now.getMonth() &&
          last.getDate() === now.getDate();
        if (sameDay && lastHm === nowHm) return;
      }

      const mode = normalizeMode(cfg.autoBackupMode);
      const filePath = await writeBackupToFile({
        mode,
        directory: cfg.autoBackupDirectory || "/app/backups",
        reason: "AUTO"
      });

      await prisma.systemConfig.update({
        where: { id: 1 },
        data: { autoBackupLastRunAt: new Date() }
      });

      try {
        await writeAuditLog({
          actorUserId: undefined,
          actorLoginName: "system-auto-backup",
          action: "AUTO_BACKUP_CREATED",
          targetType: "SystemConfig",
          targetId: "1",
          payload: { mode, filePath }
        });
      } catch {
        // kein Fehler fuer Scheduler
      }
    } catch {
      // Scheduler Fehler nicht nach außen werfen
    } finally {
      running = false;
    }
  }, 60 * 1000);
}

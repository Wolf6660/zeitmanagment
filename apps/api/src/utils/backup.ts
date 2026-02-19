import fs from "node:fs";
import path from "node:path";
import { prisma } from "../db/prisma.js";

export type BackupMode = "FULL" | "SETTINGS_ONLY" | "EMPLOYEES_TIMES_ONLY";

export async function buildBackupPayload(mode: BackupMode): Promise<Record<string, unknown>> {
  const [
    config,
    users,
    holidays,
    dropdownOptions,
    terminals,
    timeEntries,
    leaveRequests,
    sickLeaves,
    breakCredits,
    breakCreditRequests,
    specialWorkApprovals,
    overtimeAdjustments
  ] = await Promise.all([
    prisma.systemConfig.findMany(),
    prisma.user.findMany(),
    prisma.holiday.findMany(),
    prisma.dropdownOption.findMany(),
    prisma.rfidTerminal.findMany(),
    prisma.timeEntry.findMany(),
    prisma.leaveRequest.findMany(),
    prisma.sickLeave.findMany(),
    prisma.breakCredit.findMany(),
    prisma.breakCreditRequest.findMany(),
    prisma.specialWorkApproval.findMany(),
    prisma.overtimeAdjustment.findMany()
  ]);

  const fullData = {
    config,
    users,
    holidays,
    dropdownOptions,
    terminals,
    timeEntries,
    leaveRequests,
    sickLeaves,
    breakCredits,
    breakCreditRequests,
    specialWorkApprovals,
    overtimeAdjustments
  };

  const settingsOnlyData = {
    config,
    holidays,
    dropdownOptions,
    terminals
  };

  const employeesTimesOnlyData = {
    users,
    timeEntries,
    leaveRequests,
    sickLeaves,
    breakCredits,
    breakCreditRequests,
    specialWorkApprovals,
    overtimeAdjustments
  };

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      version: "1",
      system: "Zeitmanagment",
      mode
    },
    data: mode === "SETTINGS_ONLY" ? settingsOnlyData : mode === "EMPLOYEES_TIMES_ONLY" ? employeesTimesOnlyData : fullData
  };
}

export async function writeBackupToFile(input: { mode: BackupMode; directory: string; reason: "AUTO" | "MANUAL" }): Promise<string> {
  const payload = await buildBackupPayload(input.mode);
  const dir = path.resolve(input.directory || "/app/backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `zeitmanagment-${input.reason.toLowerCase()}-${String(input.mode).toLowerCase()}-${stamp}.json`;
  const fullPath = path.join(dir, filename);
  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), "utf-8");
  return fullPath;
}

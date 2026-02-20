import { Router } from "express";
import { prisma } from "../../db/prisma.js";

export const publicRouter = Router();

publicRouter.get("/config", async (_req, res) => {
  const config = await prisma.systemConfig.findUnique({
    where: { id: 1 },
    select: {
      companyName: true,
      systemName: true,
      companyLogoUrl: true,
      selfCorrectionMaxDays: true,
      colorApproved: true,
      colorRejected: true,
      colorManualCorrection: true,
      colorBulkEntry: true,
      colorBreakCredit: true,
      colorSickLeave: true,
      colorHolidayOrWeekend: true,
      colorHolidayOrWeekendWork: true,
      colorVacationWarning: true,
      colorWebEntry: true,
      colorOvertime: true,
      colorApprovedEnabled: true,
      colorRejectedEnabled: true,
      colorManualCorrectionEnabled: true,
      colorBulkEntryEnabled: true,
      colorBreakCreditEnabled: true,
      colorSickLeaveEnabled: true,
      colorHolidayOrWeekendEnabled: true,
      colorHolidayOrWeekendWorkEnabled: true,
      colorVacationWarningEnabled: true,
      colorWebEntryEnabled: true,
      colorOvertimeEnabled: true
    }
  });

  if (!config) {
    res.json({
      companyName: "Musterfirma",
      systemName: "Zeitmanagment",
      companyLogoUrl: null,
      selfCorrectionMaxDays: 3,
      colorApproved: "#22C55E",
      colorRejected: "#EF4444",
      colorManualCorrection: "#DC2626",
      colorBulkEntry: "#334155",
      colorBreakCredit: "#EC4899",
      colorSickLeave: "#3B82F6",
      colorHolidayOrWeekend: "#FDE68A",
      colorHolidayOrWeekendWork: "#F97316",
      colorVacationWarning: "#F59E0B",
      colorWebEntry: "#7DD3FC",
      colorOvertime: "#0EA5E9",
      colorApprovedEnabled: true,
      colorRejectedEnabled: true,
      colorManualCorrectionEnabled: true,
      colorBulkEntryEnabled: true,
      colorBreakCreditEnabled: true,
      colorSickLeaveEnabled: true,
      colorHolidayOrWeekendEnabled: true,
      colorHolidayOrWeekendWorkEnabled: true,
      colorVacationWarningEnabled: true,
      colorWebEntryEnabled: true,
      colorOvertimeEnabled: true
    });
    return;
  }

  res.json(config);
});

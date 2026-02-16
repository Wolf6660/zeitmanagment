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
      colorBreakCredit: true,
      colorSickLeave: true,
      colorHolidayOrWeekendWork: true,
      colorVacationWarning: true
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
      colorBreakCredit: "#EC4899",
      colorSickLeave: "#3B82F6",
      colorHolidayOrWeekendWork: "#F97316",
      colorVacationWarning: "#F59E0B"
    });
    return;
  }

  res.json(config);
});

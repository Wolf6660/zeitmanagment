export type PublicConfig = {
  companyName: string;
  systemName: string;
  companyLogoUrl?: string | null;
  selfCorrectionMaxDays?: number;
  colorApproved: string;
  colorRejected: string;
  colorManualCorrection: string;
  colorBreakCredit: string;
  colorSickLeave: string;
  colorHolidayOrWeekendWork: string;
  colorVacationWarning: string;
};

export function applyTheme(config: PublicConfig): void {
  const root = document.documentElement;
  root.style.setProperty("--approved", config.colorApproved);
  root.style.setProperty("--rejected", config.colorRejected);
  root.style.setProperty("--manual", config.colorManualCorrection);
  root.style.setProperty("--break-credit", config.colorBreakCredit);
  root.style.setProperty("--sick", config.colorSickLeave);
  root.style.setProperty("--holiday", config.colorHolidayOrWeekendWork);
  root.style.setProperty("--warning", config.colorVacationWarning);
}

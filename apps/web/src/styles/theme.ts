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
  colorHolidayOrWeekend: string;
  colorHolidayOrWeekendWork: string;
  colorVacationWarning: string;
  colorWebEntry: string;
  colorOvertime: string;
};

export function applyTheme(config: PublicConfig): void {
  const root = document.documentElement;
  root.style.setProperty("--approved", config.colorApproved);
  root.style.setProperty("--rejected", config.colorRejected);
  root.style.setProperty("--manual", config.colorManualCorrection);
  root.style.setProperty("--break-credit", config.colorBreakCredit);
  root.style.setProperty("--sick", config.colorSickLeave);
  root.style.setProperty("--holiday-day", config.colorHolidayOrWeekend);
  root.style.setProperty("--holiday", config.colorHolidayOrWeekendWork);
  root.style.setProperty("--warning", config.colorVacationWarning);
  root.style.setProperty("--web-entry", config.colorWebEntry);
  root.style.setProperty("--overtime", config.colorOvertime);
}

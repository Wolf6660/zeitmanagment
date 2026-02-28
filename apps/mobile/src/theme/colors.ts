export const colors = {
  bg: "#F7FAFC",
  card: "#FFFFFF",
  text: "#0F172A",
  muted: "#475569",
  primary: "#0F766E",
  border: "#CBD5E1",
  success: "#16A34A",
  danger: "#DC2626",
  warning: "#D97706"
};

type PublicConfigColors = {
  colorWebEntry?: string;
  colorWebEntryEnabled?: boolean;
  colorApproved?: string;
  colorApprovedEnabled?: boolean;
  colorRejected?: string;
  colorRejectedEnabled?: boolean;
  colorVacationWarning?: string;
  colorVacationWarningEnabled?: boolean;
};

export function resolveUiColors(cfg?: PublicConfigColors | null): { primary: string; success: string; danger: string; warning: string } {
  const primary = cfg?.colorWebEntryEnabled && cfg.colorWebEntry ? cfg.colorWebEntry : colors.primary;
  const success = cfg?.colorApprovedEnabled && cfg.colorApproved ? cfg.colorApproved : colors.success;
  const danger = cfg?.colorRejectedEnabled && cfg.colorRejected ? cfg.colorRejected : colors.danger;
  const warning = cfg?.colorVacationWarningEnabled && cfg.colorVacationWarning ? cfg.colorVacationWarning : colors.warning;
  return { primary, success, danger, warning };
}

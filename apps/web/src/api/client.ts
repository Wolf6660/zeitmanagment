import type { PublicConfig } from "../styles/theme";

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || "";

export type SessionUser = {
  id: string;
  name: string;
  role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
  loginName: string;
};

export type Session = {
  token: string;
  user: SessionUser;
};

export function getSession(): Session | null {
  const raw = localStorage.getItem("zm_session");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem("zm_session", JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem("zm_session");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (session?.token) {
    headers.set("Authorization", `Bearer ${session.token}`);
  }

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    let message = `Anfrage fehlgeschlagen (${res.status}).`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      try {
        const txt = await res.text();
        if (txt) message = txt.slice(0, 180);
      } catch {
        // Ignore parse error.
      }
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
  publicConfig: () => request<PublicConfig>("/api/public/config"),

  login: (payload: { loginName: string; password: string }) =>
    request<Session>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),

  me: () => request<{ id: string; name: string; role: string }>("/api/employees/me"),

  clock: (payload: { type: "CLOCK_IN" | "CLOCK_OUT"; reasonCode?: string; reasonText?: string }) =>
    request("/api/time/clock", { method: "POST", body: JSON.stringify(payload) }),

  selfCorrection: (payload: { type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; correctionComment: string }) =>
    request("/api/time/self-correction", { method: "POST", body: JSON.stringify(payload) }),

  todayEntries: (userId: string) =>
    request<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string }>>(
      `/api/time/today/${userId}`
    ),

  monthView: (userId: string, year: number, month: number) =>
    request<{
      year: number;
      month: number;
      dailyHours: number;
      monthPlanned: number;
      monthWorked: number;
      days: Array<{
        date: string;
        plannedHours: number;
        workedHours: number;
        isHoliday: boolean;
        isWeekend: boolean;
        hasManualCorrection: boolean;
        entries: Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; time: string; source: string; reasonText?: string }>;
      }>;
    }>(`/api/time/month/${userId}?year=${year}&month=${month}`),

  dayOverrideSelf: (payload: { date: string; note: string; events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> }) =>
    request("/api/time/day-override-self", { method: "POST", body: JSON.stringify(payload) }),

  dayOverrideBySupervisor: (payload: { userId: string; date: string; note: string; events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> }) =>
    request("/api/time/day-override", { method: "POST", body: JSON.stringify(payload) }),

  myLeaves: () =>
    request<Array<{ id: string; status: string; kind: string; startDate: string; endDate: string; note?: string; requestedAt: string }>>(
      "/api/leave/my"
    ),

  createLeave: (payload: { kind: "VACATION" | "OVERTIME"; startDate: string; endDate: string; note: string }) =>
    request<{ warningOverdrawn: boolean; availableVacationDays: number; availableOvertimeHours: number }>("/api/leave", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  summary: (userId: string) =>
    request<{ month: string; plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean }>(
      `/api/time/summary/${userId}`
    ),

  employees: () =>
    request<
      Array<{
        id: string;
        name: string;
        email: string;
        role: string;
        isActive: boolean;
        annualVacationDays: number;
        dailyWorkHours?: number | null;
        carryOverVacationDays: number;
        loginName: string;
        mailNotificationsEnabled: boolean;
        webLoginEnabled: boolean;
        rfidTag?: string | null;
      }>
    >("/api/employees"),

  createEmployee: (payload: {
    name: string;
    email: string;
    loginName: string;
    password: string;
    role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
    annualVacationDays: number;
    dailyWorkHours?: number;
    carryOverVacationDays: number;
    mailNotificationsEnabled: boolean;
    webLoginEnabled: boolean;
    rfidTag?: string;
  }) => request("/api/employees", { method: "POST", body: JSON.stringify(payload) }),

  updateEmployee: (
    id: string,
    payload: {
      name?: string;
      email?: string;
      role?: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
      annualVacationDays?: number;
      dailyWorkHours?: number | null;
      carryOverVacationDays?: number;
      mailNotificationsEnabled?: boolean;
      webLoginEnabled?: boolean;
      rfidTag?: string | null;
      isActive?: boolean;
    }
  ) => request(`/api/employees/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  pendingLeaves: () =>
    request<
      Array<{
        id: string;
        kind: string;
        startDate: string;
        endDate: string;
        note?: string;
        userId: string;
        availableVacationDays: number;
        requestedWorkingDays: number;
        remainingVacationAfterRequest: number;
        availableOvertimeHours: number;
        user: { name: string };
      }>
    >("/api/leave/pending"),

  decideLeave: (payload: { leaveId: string; decision: "APPROVED" | "REJECTED"; decisionNote: string }) =>
    request("/api/leave/decision", { method: "POST", body: JSON.stringify(payload) }),

  supervisorUpdateLeave: (payload: {
    leaveId: string;
    kind: "VACATION" | "OVERTIME";
    startDate: string;
    endDate: string;
    note: string;
    changeNote: string;
  }) => request("/api/leave/supervisor-update", { method: "POST", body: JSON.stringify(payload) }),

  getConfig: () =>
    request<{
      systemName: string;
      companyName: string;
      companyLogoUrl?: string | null;
      defaultDailyHours: number;
      defaultWeeklyWorkingDays?: string;
      selfCorrectionMaxDays?: number;
      autoBreakMinutes: number;
      autoBreakAfterHours: number;
      colorApproved: string;
      colorRejected: string;
      colorManualCorrection: string;
      colorBreakCredit: string;
      colorSickLeave: string;
      colorHolidayOrWeekendWork: string;
      colorVacationWarning: string;
    }>("/api/admin/config"),

  updateConfig: (payload: Record<string, unknown>) =>
    request("/api/admin/config", { method: "PATCH", body: JSON.stringify(payload) }),

  listTerminals: () =>
    request<Array<{ id: string; name: string; location?: string; isActive: boolean; apiKey: string; lastSeenAt?: string }>>(
      "/api/admin/terminals"
    ),

  createTerminal: (payload: { name: string; location?: string }) =>
    request<{ id: string; name: string; location?: string; isActive: boolean; apiKey: string }>("/api/admin/terminals", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  updateTerminal: (id: string, payload: { name?: string; location?: string | null; isActive?: boolean }) =>
    request(`/api/admin/terminals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  regenerateTerminalKey: (id: string) =>
    request<{ id: string; apiKey: string }>(`/api/admin/terminals/${id}/regenerate-key`, { method: "POST" }),

  createOvertimeAdjustment: (payload: { userId: string; date: string; hours: number; note: string }) =>
    request("/api/time/overtime-adjustment", { method: "POST", body: JSON.stringify(payload) }),

  overtimeAdjustments: (userId: string) =>
    request<Array<{ id: string; userId: string; date: string; hours: number; reason: string; createdAt: string }>>(
      `/api/time/overtime-adjustment/${userId}`
    ),

  listAuditLogs: () =>
    request<Array<{ id: string; actorLoginName: string; action: string; targetType?: string; targetId?: string; payloadJson?: string; createdAt: string }>>(
      "/api/admin/audit-logs"
    ),

  uploadLogo: (payload: { filename: string; contentBase64: string }) =>
    request<{ logoUrl: string }>("/api/admin/logo-upload", { method: "POST", body: JSON.stringify(payload) })
};

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
    let message = "Anfrage fehlgeschlagen.";
    try {
      const body = await res.json();
      if (body?.message) {
        message = body.message;
      }
    } catch {
      // Ignore parse error.
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

  todayEntries: (userId: string) =>
    request<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string }>>(
      `/api/time/today/${userId}`
    ),

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
        carryOverVacationDays: number;
        loginName: string;
        mailNotificationsEnabled: boolean;
      }>
    >("/api/employees"),

  createEmployee: (payload: {
    name: string;
    email: string;
    loginName: string;
    password: string;
    role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
    annualVacationDays: number;
    carryOverVacationDays: number;
    mailNotificationsEnabled: boolean;
  }) => request("/api/employees", { method: "POST", body: JSON.stringify(payload) }),

  updateEmployee: (
    id: string,
    payload: {
      name?: string;
      email?: string;
      role?: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
      annualVacationDays?: number;
      carryOverVacationDays?: number;
      mailNotificationsEnabled?: boolean;
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
    request<{ id: string; apiKey: string }>(`/api/admin/terminals/${id}/regenerate-key`, { method: "POST" })
};

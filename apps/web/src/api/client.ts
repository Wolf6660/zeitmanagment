const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

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
  login: (payload: { loginName: string; password: string }) =>
    request<Session>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),

  me: () => request<{ id: string; name: string; role: string }>("/api/employees/me"),

  clock: (payload: { type: "CLOCK_IN" | "CLOCK_OUT"; reasonCode?: string; reasonText?: string }) =>
    request("/api/time/clock", { method: "POST", body: JSON.stringify(payload) }),

  myLeaves: () => request<Array<{ id: string; status: string; kind: string; startDate: string; endDate: string; note?: string; requestedAt: string }>>("/api/leave/my"),

  createLeave: (payload: { kind: "VACATION" | "OVERTIME"; startDate: string; endDate: string; note?: string }) =>
    request<{ warningOverdrawn: boolean }>("/api/leave", { method: "POST", body: JSON.stringify(payload) }),

  summary: (userId: string) =>
    request<{ month: string; plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean }>(`/api/time/summary/${userId}`),

  employees: () =>
    request<Array<{ id: string; name: string; role: string; isActive: boolean; annualVacationDays: number; carryOverVacationDays: number }>>("/api/employees"),

  pendingLeaves: () =>
    request<Array<{ id: string; kind: string; startDate: string; endDate: string; note?: string; user: { name: string } }>>("/api/leave/pending"),

  decideLeave: (payload: { leaveId: string; decision: "APPROVED" | "REJECTED"; decisionNote?: string }) =>
    request("/api/leave/decision", { method: "POST", body: JSON.stringify(payload) }),

  getConfig: () =>
    request<{
      systemName: string;
      companyName: string;
      autoBreakMinutes: number;
      autoBreakAfterHours: number;
      colorApproved: string;
      colorRejected: string;
      colorManualCorrection: string;
      colorBreakCredit: string;
      colorSickLeave: string;
      colorHolidayOrWeekendWork: string;
      colorVacationWarning: string;
      webPort: number;
      apiPort: number;
      terminalPort: number;
    }>("/api/admin/config"),

  updateConfig: (payload: Record<string, unknown>) =>
    request("/api/admin/config", { method: "PATCH", body: JSON.stringify(payload) }),

  listTerminals: () =>
    request<Array<{ id: string; name: string; location?: string; isActive: boolean; apiKey: string; lastSeenAt?: string }>>(
      "/api/admin/terminals"
    ),

  createTerminal: (payload: { name: string; location?: string }) =>
    request<{ id: string; name: string; location?: string; isActive: boolean; apiKey: string }>(
      "/api/admin/terminals",
      { method: "POST", body: JSON.stringify(payload) }
    ),

  updateTerminal: (id: string, payload: { name?: string; location?: string | null; isActive?: boolean }) =>
    request(`/api/admin/terminals/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  regenerateTerminalKey: (id: string) =>
    request<{ id: string; apiKey: string }>(`/api/admin/terminals/${id}/regenerate-key`, { method: "POST" })
};

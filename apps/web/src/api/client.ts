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

  todayOverview: () =>
    request<Array<{ id: string; userId: string; userName: string; loginName: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string | null }>>(
      "/api/time/today-overview"
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
        sickHours?: number;
        isSick?: boolean;
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

  bulkEntry: (payload: { userId: string; startDate: string; endDate: string; clockIn: string; clockOut: string; note: string }) =>
    request<{ insertedDays: number; skippedDays: number; insertedDates: string[]; skippedDates: string[]; grossHoursPerDay: number }>("/api/time/bulk-entry", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  myLeaves: () =>
    request<Array<{ id: string; status: string; kind: string; startDate: string; endDate: string; note?: string; requestedAt: string; decisionNote?: string | null; decidedAt?: string | null; decidedBy?: { id: string; name: string; loginName: string } | null }>>(
      "/api/leave/my"
    ),

  allLeaves: () =>
    request<
      Array<{
        id: string;
        status: string;
        kind: string;
        startDate: string;
        endDate: string;
        note?: string;
        requestedAt: string;
        decisionNote?: string | null;
        decidedAt?: string | null;
        user: { id: string; name: string; loginName: string };
        decidedBy?: { id: string; name: string; loginName: string } | null;
      }>
    >("/api/leave/all"),

  createLeave: (payload: { kind: "VACATION" | "OVERTIME"; startDate: string; endDate: string; note: string }) =>
    request<{ warningOverdrawn: boolean; availableVacationDays: number; availableOvertimeHours: number }>("/api/leave", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  summary: (userId: string) =>
    request<{ month: string; plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean }>(
      `/api/time/summary/${userId}`
    ),

  supervisorOverview: () =>
    request<{ monthLabel: string; monthPlannedHours: number; rows: Array<{ userId: string; istHours: number; sollHours: number; overtimeHours: number }> }>(
      "/api/time/supervisor-overview"
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
        timeTrackingEnabled: boolean;
        rfidTag?: string | null;
        rfidTagActive?: boolean;
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
    timeTrackingEnabled?: boolean;
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
      timeTrackingEnabled?: boolean;
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

  leaveAvailability: (userId: string) =>
    request<{ userId: string; availableVacationDays: number; availableOvertimeHours: number }>(`/api/leave/availability/${userId}`),

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
      requireApprovalForCrossMidnight?: boolean;
      requireReasonWebClock?: boolean;
      requireNoteSelfCorrection?: boolean;
      requireNoteSupervisorCorrection?: boolean;
      requireNoteLeaveRequest?: boolean;
      requireNoteLeaveDecision?: boolean;
      requireNoteLeaveSupervisorUpdate?: boolean;
      requireNoteOvertimeAdjustment?: boolean;
      requireNoteOvertimeAccountSet?: boolean;
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
      smtpEnabled?: boolean;
      smtpHost?: string | null;
      smtpPort?: number;
      smtpUser?: string | null;
      smtpPassword?: string | null;
      smtpFrom?: string | null;
      smtpSenderName?: string | null;
      accountantMailEnabled?: boolean;
      accountantEmail?: string | null;
      mailOnEmployeeLeaveDecision?: boolean;
      mailOnEmployeeOvertimeDecision?: boolean;
      mailOnEmployeeLongShift?: boolean;
      mailOnSupervisorLeaveRequest?: boolean;
      mailOnSupervisorOvertimeRequest?: boolean;
      mailOnSupervisorCrossMidnight?: boolean;
      mailOnSupervisorUnknownRfid?: boolean;
      mailOnAdminUnknownRfid?: boolean;
      mailOnAdminSystemError?: boolean;
    }>("/api/admin/config"),

  updateConfig: (payload: Record<string, unknown>) =>
    request("/api/admin/config", { method: "PATCH", body: JSON.stringify(payload) }),

  testMailSender: () =>
    request<{ ok: boolean }>("/api/admin/mail/test-sender", { method: "POST", body: "{}" }),

  testMailAccountant: () =>
    request<{ ok: boolean }>("/api/admin/mail/test-accountant", { method: "POST", body: "{}" }),

  testMailEmployee: (userId: string) =>
    request<{ ok: boolean }>("/api/admin/mail/test-employee", { method: "POST", body: JSON.stringify({ userId }) }),

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

  listUnassignedRfidScans: () =>
    request<Array<{
      rfidTag: string;
      seenCount: number;
      lastSeenAt: string;
      terminalId?: string;
      terminalName?: string;
      lastType?: string;
      lastReasonText?: string | null;
    }>>("/api/admin/rfid/unassigned"),

  deleteUnassignedRfidTag: (rfidTag: string) =>
    request<{ ok: boolean }>("/api/admin/rfid/unassigned/delete", {
      method: "POST",
      body: JSON.stringify({ rfidTag })
    }),

  assignRfidTag: (payload: { userId: string; rfidTag: string; note?: string }) =>
    request<{ id: string; name: string; loginName: string; rfidTag: string | null; rfidTagActive: boolean }>("/api/admin/rfid/assign", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  unassignRfidTag: (payload: { userId: string; mode?: "DEACTIVATE" | "DELETE" }) =>
    request<{ id: string; name: string; loginName: string; rfidTag: string | null; rfidTagActive: boolean }>("/api/admin/rfid/unassign", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  generateEspProvisionConfig: (payload: {
    terminalId: string;
    wifiSsid: string;
    wifiPassword: string;
    serverHost: string;
    serverPort: number;
    useTls: boolean;
    displayEnabled: boolean;
    displayRows: number;
    displayPins?: {
      sda?: number;
      scl?: number;
      address?: string;
    };
    readerType: "RC522" | "PN532";
    pn532Mode?: "I2C" | "SPI";
    pins: {
      sda?: number;
      scl?: number;
      mosi?: number;
      miso?: number;
      sck?: number;
      ss?: number;
      rst?: number;
      irq?: number;
    };
  }) =>
    request<Record<string, unknown>>("/api/admin/esp/provision-config", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  createOvertimeAdjustment: (payload: { userId: string; date: string; hours: number; note: string }) =>
    request("/api/time/overtime-adjustment", { method: "POST", body: JSON.stringify(payload) }),

  overtimeAdjustments: (userId: string) =>
    request<Array<{ id: string; userId: string; date: string; hours: number; reason: string; createdAt: string }>>(
      `/api/time/overtime-adjustment/${userId}`
    ),

  overtimeAccount: (userId: string) =>
    request<{ userId: string; overtimeBalanceHours: number }>(`/api/time/overtime-account/${userId}`),

  setOvertimeAccount: (userId: string, payload: { hours: number; note: string }) =>
    request<{ userId: string; overtimeBalanceHours: number; delta: number }>(`/api/time/overtime-account/${userId}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  holidays: () => request<Array<{ id: string; date: string; name: string }>>("/api/time/holidays"),

  createHoliday: (payload: { date: string; name: string }) =>
    request<{ id: string; date: string; name: string }>("/api/time/holidays", { method: "POST", body: JSON.stringify(payload) }),

  updateHoliday: (id: string, payload: { date?: string; name?: string }) =>
    request<{ id: string; date: string; name: string }>(`/api/time/holidays/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),

  deleteHoliday: (id: string) =>
    request<{ ok: boolean }>(`/api/time/holidays/${id}`, { method: "DELETE" }),

  createSickLeave: (payload: { userId: string; startDate: string; endDate: string; partialDayHours?: number; note?: string }) =>
    request("/api/time/sick-leave", { method: "POST", body: JSON.stringify(payload) }),

  deleteSickLeaveDay: (payload: { userId: string; date: string }) =>
    request<{ ok: boolean }>("/api/time/sick-leave/delete-day", { method: "POST", body: JSON.stringify(payload) }),

  pendingSpecialWork: () =>
    request<Array<{ id: string; userId: string; date: string; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note?: string; user: { id: string; name: string; loginName: string } }>>(
      "/api/time/special-work/pending"
    ),

  decideSpecialWork: (payload: { approvalId: string; decision: "APPROVED" | "REJECTED"; note: string }) =>
    request<{ id: string; status: "APPROVED" | "REJECTED" }>("/api/time/special-work/decision", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  listAuditLogs: () =>
    request<Array<{ id: string; actorLoginName: string; action: string; targetType?: string; targetId?: string; payloadJson?: string; createdAt: string }>>(
      "/api/admin/audit-logs"
    ),

  uploadLogo: (payload: { filename: string; contentBase64: string }) =>
    request<{ logoUrl: string }>("/api/admin/logo-upload", { method: "POST", body: JSON.stringify(payload) })
};

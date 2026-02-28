import type { ClockType, EmployeeRow, LeaveRequestRow, Session } from "../types/app";

export class ApiClient {
  private readonly baseUrl: string;
  private session: Session | null;

  constructor(baseUrl: string, session: Session | null) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.session = session;
  }

  setSession(session: Session | null) {
    this.session = session;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (this.session?.token) {
      headers.set("Authorization", `Bearer ${this.session.token}`);
    }

    const res = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    if (!res.ok) {
      let msg = `Anfrage fehlgeschlagen (${res.status})`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) msg = body.message;
      } catch {
        // ignore body parse
      }
      throw new Error(msg);
    }

    if (res.status === 204) return null as T;
    return (await res.json()) as T;
  }

  login(loginName: string, password: string) {
    return this.request<Session>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ loginName, password })
    });
  }

  me() {
    return this.request<{ id: string; name: string; role: string; annualVacationDays: number; carryOverVacationDays: number }>(
      "/api/employees/me"
    );
  }

  publicConfig() {
    return this.request<{
      selfCorrectionMaxDays?: number;
      colorWebEntry?: string;
      colorWebEntryEnabled?: boolean;
      colorApproved?: string;
      colorApprovedEnabled?: boolean;
      colorRejected?: string;
      colorRejectedEnabled?: boolean;
      colorVacationWarning?: string;
      colorVacationWarningEnabled?: boolean;
    }>("/api/public/config");
  }

  clock(type: ClockType, reasonText: string) {
    return this.request("/api/time/clock", {
      method: "POST",
      body: JSON.stringify({ type, reasonText })
    });
  }

  selfCorrection(type: ClockType, occurredAt: string, correctionComment: string) {
    return this.request("/api/time/self-correction", {
      method: "POST",
      body: JSON.stringify({ type, occurredAt, correctionComment })
    });
  }

  azubiSchoolDay(date: string) {
    return this.request("/api/time/azubi/school-day", {
      method: "POST",
      body: JSON.stringify({ date })
    });
  }

  myRequests() {
    return this.request<LeaveRequestRow[]>("/api/leave/my");
  }

  createLeave(kind: "VACATION" | "OVERTIME", startDate: string, endDate: string, note: string) {
    return this.request("/api/leave", {
      method: "POST",
      body: JSON.stringify({ kind, startDate, endDate, note })
    });
  }

  createBreakCreditRequest(date: string, minutes: number, reason: string) {
    return this.request("/api/time/break-credit/request", {
      method: "POST",
      body: JSON.stringify({ date, minutes, reason })
    });
  }

  createBreakCredit(userId: string, dateIso: string, minutes: number, reason: string) {
    return this.request("/api/time/break-credit", {
      method: "POST",
      body: JSON.stringify({ userId, date: dateIso, minutes, reason })
    });
  }

  createSickLeave(userId: string, startDateIso: string, endDateIso: string, note: string) {
    return this.request("/api/time/sick-leave", {
      method: "POST",
      body: JSON.stringify({ userId, startDate: startDateIso, endDate: endDateIso, note })
    });
  }

  employees() {
    return this.request<EmployeeRow[]>("/api/employees");
  }

  supervisorCorrection(userId: string, type: ClockType, occurredAtIso: string, correctionComment: string) {
    return this.request("/api/time/correction", {
      method: "POST",
      body: JSON.stringify({ userId, type, occurredAt: occurredAtIso, correctionComment })
    });
  }

  monthView(userId: string, year: number, month: number) {
    return this.request<{
      monthWorked: number;
      monthPlanned: number;
      dailyHours: number;
      days: Array<{
        date: string;
        workedHours: number;
        plannedHours: number;
        isHoliday: boolean;
        isWeekend: boolean;
        entries: Array<{ id: string; type: ClockType; time: string; source: string; reasonText?: string }>;
      }>;
    }>(`/api/time/month/${userId}?year=${year}&month=${month}`);
  }

  dayOverride(userId: string, date: string, note: string, events: Array<{ type: ClockType; time: string }>) {
    return this.request("/api/time/day-override", {
      method: "POST",
      body: JSON.stringify({ userId, date, note, events })
    });
  }

  dayOverrideSelf(date: string, note: string, events: Array<{ type: ClockType; time: string }>) {
    return this.request("/api/time/day-override-self", {
      method: "POST",
      body: JSON.stringify({ date, note, events })
    });
  }

  todayOverview() {
    return this.request<Array<{ id: string; userName: string; type: ClockType; occurredAt: string; reasonText?: string | null }>>(
      "/api/time/today-overview"
    );
  }

  pendingRequests() {
    return this.request<Array<{ id: string; status: string; user: { name: string }; kind: string; startDate: string; endDate: string }>>(
      "/api/leave/pending"
    );
  }

  leaveDecision(leaveId: string, decision: "APPROVED" | "REJECTED", decisionNote: string) {
    return this.request("/api/leave/decision", {
      method: "POST",
      body: JSON.stringify({ leaveId, decision, decisionNote })
    });
  }

  pendingBreakCreditRequests() {
    return this.request<Array<{ id: string; date: string; minutes: number; reason: string; user: { id: string; name: string; loginName: string } }>>(
      "/api/time/break-credit/request/pending"
    );
  }

  breakCreditDecision(requestId: string, decision: "APPROVED" | "REJECTED", decisionNote: string) {
    return this.request("/api/time/break-credit/request/decision", {
      method: "POST",
      body: JSON.stringify({ requestId, decision, decisionNote })
    });
  }
}

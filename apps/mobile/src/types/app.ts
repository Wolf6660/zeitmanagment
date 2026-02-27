export type Role = "EMPLOYEE" | "AZUBI" | "SUPERVISOR" | "ADMIN";

export type SessionUser = {
  id: string;
  name: string;
  role: Role;
  loginName: string;
};

export type Session = {
  token: string;
  user: SessionUser;
};

export type ProvisioningPayload = {
  apiBaseUrl: string;
  loginName?: string;
  password?: string;
};

export type StoredProvisioning = {
  apiBaseUrl: string;
  lockedAt: string;
};

export type ClockType = "CLOCK_IN" | "CLOCK_OUT";

export type LeaveKind = "VACATION" | "OVERTIME";

export type LeaveStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELED";

export type LeaveRequestRow = {
  id: string;
  kind: LeaveKind;
  status: LeaveStatus;
  startDate: string;
  endDate: string;
  note?: string;
  requestedAt: string;
};

export type EmployeeRow = {
  id: string;
  name: string;
  loginName: string;
  role: Role;
  isActive: boolean;
};

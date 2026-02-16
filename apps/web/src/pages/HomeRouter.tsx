import React from "react";
import { getSession } from "../api/client";
import { EmployeeHome } from "./employee/EmployeeHome";
import { SupervisorHome } from "./supervisor/SupervisorHome";

export function HomeRouter() {
  const session = getSession();
  if (!session) return null;

  if (session.user.role === "EMPLOYEE") {
    return <EmployeeHome />;
  }

  if (session.user.role === "SUPERVISOR") {
    return <SupervisorHome />;
  }

  return <SupervisorHome />;
}

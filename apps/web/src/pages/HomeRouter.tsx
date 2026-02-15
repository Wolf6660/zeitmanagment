import React from "react";
import { getSession } from "../api/client";
import { EmployeeHome } from "./employee/EmployeeHome";
import { SupervisorHome } from "./supervisor/SupervisorHome";
import { AdminHome } from "./admin/AdminHome";

export function HomeRouter() {
  const session = getSession();
  if (!session) return null;

  if (session.user.role === "EMPLOYEE") {
    return <EmployeeHome />;
  }

  if (session.user.role === "SUPERVISOR") {
    return (
      <>
        <SupervisorHome />
        <div style={{ marginTop: 12 }}><AdminHome /></div>
      </>
    );
  }

  return (
    <>
      <SupervisorHome />
      <div style={{ marginTop: 12 }}><AdminHome /></div>
    </>
  );
}

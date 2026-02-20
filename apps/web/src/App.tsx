import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./api/client";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { HomeRouter } from "./pages/HomeRouter";
import { AdminHome } from "./pages/admin/AdminHome";
import { MonthEditorPage } from "./pages/month/MonthEditorPage";
import { EmployeeMonthPage } from "./pages/month/EmployeeMonthPage";
import { HolidaysPage } from "./pages/holidays/HolidaysPage";
import { SupervisorEmployeesPage } from "./pages/supervisor/SupervisorEmployeesPage";
import { RequestsPage } from "./pages/requests/RequestsPage";
import { MyRequestsPage } from "./pages/requests/MyRequestsPage";
import { GuidesPage } from "./pages/guides/GuidesPage";
import { SicknessPage } from "./pages/sickness/SicknessPage";
import { SettingsHome } from "./pages/settings/SettingsHome";
import { ChangePasswordPage } from "./pages/account/ChangePasswordPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "ADMIN") {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

function SupervisorOrAdminRoute({ children }: { children: React.ReactNode }) {
  const session = getSession();
  if (!session) return <Navigate to="/login" replace />;
  if (session.user.role !== "ADMIN" && session.user.role !== "SUPERVISOR") {
    return <Navigate to="/app" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/app"
        element={
          <PrivateRoute>
            <AppLayout>
              <HomeRouter />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/app/admin"
        element={
          <AdminRoute>
            <AppLayout>
              <AdminHome />
            </AppLayout>
          </AdminRoute>
        }
      />
      <Route
        path="/app/month"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <MonthEditorPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/month-self"
        element={
          <PrivateRoute>
            <AppLayout>
              <EmployeeMonthPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/app/holidays"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <HolidaysPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/settings"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <SettingsHome />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/sickness"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <SicknessPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/team"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <SupervisorEmployeesPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/requests"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <RequestsPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route
        path="/app/my-requests"
        element={
          <PrivateRoute>
            <AppLayout>
              <MyRequestsPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/app/change-password"
        element={
          <PrivateRoute>
            <AppLayout>
              <ChangePasswordPage />
            </AppLayout>
          </PrivateRoute>
        }
      />
      <Route
        path="/app/guides"
        element={
          <AdminRoute>
            <AppLayout>
              <GuidesPage />
            </AppLayout>
          </AdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

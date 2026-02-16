import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getSession } from "./api/client";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage } from "./pages/auth/LoginPage";
import { HomeRouter } from "./pages/HomeRouter";
import { AdminHome } from "./pages/admin/AdminHome";
import { MonthEditorPage } from "./pages/month/MonthEditorPage";
import { HolidaysPage } from "./pages/holidays/HolidaysPage";
import { SupervisorEmployeesPage } from "./pages/supervisor/SupervisorEmployeesPage";

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
        path="/app/team"
        element={
          <SupervisorOrAdminRoute>
            <AppLayout>
              <SupervisorEmployeesPage />
            </AppLayout>
          </SupervisorOrAdminRoute>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  );
}

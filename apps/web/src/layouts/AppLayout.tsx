import React, { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, clearSession, getSession } from "../api/client";
import type { PublicConfig } from "../styles/theme";
import { applyTheme } from "../styles/theme";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = getSession();
  const [brand, setBrand] = useState<Pick<PublicConfig, "companyName" | "systemName" | "companyLogoUrl"> | null>(null);
  const showSettingsSubmenu = Boolean(
    (session?.user.role === "ADMIN" || session?.user.role === "SUPERVISOR")
      && (location.pathname === "/app/settings"
        || location.pathname === "/app/holidays"
        || location.pathname === "/app/requests"
        || location.pathname === "/app/team")
  );

  useEffect(() => {
    api.publicConfig()
      .then((config) => {
        setBrand({ companyName: config.companyName, systemName: config.systemName, companyLogoUrl: config.companyLogoUrl });
        applyTheme(config);
      })
      .catch(() => {
        setBrand({ companyName: "Musterfirma", systemName: "Zeitmanagment", companyLogoUrl: null });
      });
  }, []);

  const navClass = (paths: string[]) => (paths.includes(location.pathname) ? "active" : "inactive");

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="brand-wrap">
          <div>
            <div className="brand-title">{brand?.companyName || "Musterfirma"}</div>
            <div style={{ color: "var(--muted)", fontSize: 14 }}>{brand?.systemName || "Zeitmanagment"}</div>
          </div>
          {brand?.companyLogoUrl && <img className="brand-logo" src={brand.companyLogoUrl} alt="Firmenlogo" />}
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
          <div className="nav app-main-nav" style={{ margin: 0 }}>
            <Link to="/app"><button className={navClass(["/app"])}>Startseite</button></Link>
            {(session?.user.role === "EMPLOYEE" || session?.user.role === "AZUBI") && (
              <Link to="/app/month-self"><button className={navClass(["/app/month-self"])}>Monatsansicht</button></Link>
            )}
            {(session?.user.role === "ADMIN" || session?.user.role === "SUPERVISOR") && (
              <Link to="/app/month"><button className={navClass(["/app/month"])}>Monatsansicht</button></Link>
            )}
            {(session?.user.role === "EMPLOYEE" || session?.user.role === "AZUBI" || session?.user.role === "SUPERVISOR") && (
              <Link to="/app/my-requests"><button className={navClass(["/app/my-requests"])}>Urlaub / AZ</button></Link>
            )}
            {(session?.user.role === "EMPLOYEE" || session?.user.role === "AZUBI") && (
              <Link to="/app/change-password"><button className={navClass(["/app/change-password"])}>Kennwort</button></Link>
            )}
            {(session?.user.role === "ADMIN" || session?.user.role === "SUPERVISOR") && (
              <Link to="/app/sickness"><button className={navClass(["/app/sickness"])}>Krankheit</button></Link>
            )}
            {(session?.user.role === "ADMIN" || session?.user.role === "SUPERVISOR") && (
              <Link to="/app/settings"><button className={navClass(["/app/settings", "/app/holidays", "/app/requests", "/app/team"])}>Einstellungen</button></Link>
            )}
            {session?.user.role === "ADMIN" && (
              <Link to="/app/guides"><button className={navClass(["/app/guides"])}>Anleitungen</button></Link>
            )}
            {session?.user.role === "ADMIN" && (
              <Link to="/app/admin"><button className={navClass(["/app/admin"])}>Admin</button></Link>
            )}
          </div>
          <div className="row">
            <span>{session?.user.name}</span>
            <button
              className="secondary"
              onClick={() => {
                clearSession();
                navigate("/login");
              }}
            >
              Logout
            </button>
          </div>
        </div>
        {showSettingsSubmenu && (
          <div className="card" style={{ marginTop: 10, padding: 10 }}>
            <div className="nav app-sub-nav" style={{ margin: 0 }}>
              <Link to="/app/holidays"><button className={navClass(["/app/holidays"])}>Feiertage</button></Link>
              <Link to="/app/requests"><button className={navClass(["/app/requests"])}>Antraege</button></Link>
              <Link to="/app/team"><button className={navClass(["/app/team"])}>Mitarbeiter</button></Link>
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

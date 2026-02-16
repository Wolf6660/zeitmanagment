import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, clearSession, getSession } from "../api/client";
import type { PublicConfig } from "../styles/theme";
import { applyTheme } from "../styles/theme";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const session = getSession();
  const [brand, setBrand] = useState<Pick<PublicConfig, "companyName" | "systemName"> | null>(null);

  useEffect(() => {
    api.publicConfig()
      .then((config) => {
        setBrand({ companyName: config.companyName, systemName: config.systemName });
        applyTheme(config);
      })
      .catch(() => {
        setBrand({ companyName: "Musterfirma", systemName: "Zeitmanagment" });
      });
  }, []);

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <strong>{brand?.companyName || "Musterfirma"}</strong>
            <div style={{ color: "var(--muted)", fontSize: 13 }}>{brand?.systemName || "Zeitmanagment"}</div>
          </div>
          <span>{session?.user.name}</span>
        </div>
        <div className="nav" style={{ marginTop: 8 }}>
          <Link to="/app"><button>Startseite</button></Link>
          {(session?.user.role === "ADMIN" || session?.user.role === "SUPERVISOR") && (
            <Link to="/app/admin"><button>Admin</button></Link>
          )}
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
      {children}
    </div>
  );
}

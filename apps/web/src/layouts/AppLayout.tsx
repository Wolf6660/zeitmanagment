import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { clearSession, getSession } from "../api/client";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const session = getSession();

  return (
    <div className="page">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Zeitmanagment</strong>
          <span>{session?.user.name}</span>
        </div>
        <div className="nav" style={{ marginTop: 8 }}>
          <Link to="/app"><button>Startseite</button></Link>
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

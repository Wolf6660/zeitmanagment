import React from "react";
import { Link } from "react-router-dom";

export function SettingsHome() {
  return (
    <div className="card">
      <h2>Einstellungen</h2>
      <div className="card" style={{ padding: 12 }}>
        <div className="nav" style={{ margin: 0 }}>
          <Link to="/app/holidays"><button>Feiertage</button></Link>
          <Link to="/app/requests"><button>Antraege</button></Link>
          <Link to="/app/team"><button>Mitarbeiter</button></Link>
        </div>
        <div style={{ marginTop: 10, color: "var(--muted)" }}>
          Bitte einen Punkt im Untermenue waehlen.
        </div>
      </div>
    </div>
  );
}

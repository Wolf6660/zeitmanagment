import React from "react";
import { Link } from "react-router-dom";

export function SettingsHome() {
  return (
    <div className="card">
      <h2>Einstellungen</h2>
      <div className="grid grid-2">
        <Link to="/app/holidays"><button>Feiertage</button></Link>
        <Link to="/app/requests"><button>Antraege</button></Link>
        <Link to="/app/team"><button>Mitarbeiter</button></Link>
      </div>
    </div>
  );
}

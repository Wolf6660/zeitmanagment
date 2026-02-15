import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

export function AdminHome() {
  const [config, setConfig] = useState<any>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.getConfig().then(setConfig).catch((e) => setMsg((e as Error).message));
  }, []);

  if (!config) {
    return <div className="card">Konfiguration wird geladen...</div>;
  }

  return (
    <div className="card">
      <h2>Admin Einstellungen</h2>
      <div className="grid grid-2">
        <label>
          Firmenname
          <input value={config.companyName || ""} onChange={(e) => setConfig({ ...config, companyName: e.target.value })} />
        </label>
        <label>
          Systemname
          <input value={config.systemName || ""} onChange={(e) => setConfig({ ...config, systemName: e.target.value })} />
        </label>
        <label>
          Auto Pause (Minuten)
          <input type="number" value={config.autoBreakMinutes} onChange={(e) => setConfig({ ...config, autoBreakMinutes: Number(e.target.value) })} />
        </label>
        <label>
          Auto Pause ab Stunden
          <input type="number" value={config.autoBreakAfterHours} onChange={(e) => setConfig({ ...config, autoBreakAfterHours: Number(e.target.value) })} />
        </label>
      </div>

      <h3>Farben</h3>
      <div className="grid grid-2">
        {[
          "colorApproved",
          "colorRejected",
          "colorManualCorrection",
          "colorBreakCredit",
          "colorSickLeave",
          "colorHolidayOrWeekendWork",
          "colorVacationWarning"
        ].map((field) => (
          <label key={field}>
            {field}
            <input type="color" value={config[field]} onChange={(e) => setConfig({ ...config, [field]: e.target.value })} />
          </label>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button onClick={async () => {
          await api.updateConfig(config);
          setMsg("Gespeichert.");
        }}>Speichern</button>
      </div>
      {msg && <div className="success">{msg}</div>}
    </div>
  );
}

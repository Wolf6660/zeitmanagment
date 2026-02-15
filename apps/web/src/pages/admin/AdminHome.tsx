import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

type AdminConfig = {
  companyName: string;
  systemName: string;
  autoBreakMinutes: number;
  autoBreakAfterHours: number;
  colorApproved: string;
  colorRejected: string;
  colorManualCorrection: string;
  colorBreakCredit: string;
  colorSickLeave: string;
  colorHolidayOrWeekendWork: string;
  colorVacationWarning: string;
  webPort: number;
  apiPort: number;
  terminalPort: number;
};

type Terminal = {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  apiKey: string;
  lastSeenAt?: string;
};

export function AdminHome() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [terminalName, setTerminalName] = useState("");
  const [terminalLocation, setTerminalLocation] = useState("");
  const [msg, setMsg] = useState("");

  async function loadData() {
    const [cfg, trms] = await Promise.all([api.getConfig(), api.listTerminals()]);
    setConfig(cfg);
    setTerminals(trms);
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
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

      <h3>Ports (Sollwerte)</h3>
      <div className="grid grid-2">
        <label>
          Web Port
          <input type="number" value={config.webPort} onChange={(e) => setConfig({ ...config, webPort: Number(e.target.value) })} />
        </label>
        <label>
          API Port
          <input type="number" value={config.apiPort} onChange={(e) => setConfig({ ...config, apiPort: Number(e.target.value) })} />
        </label>
        <label>
          Terminal Port
          <input type="number" value={config.terminalPort} onChange={(e) => setConfig({ ...config, terminalPort: Number(e.target.value) })} />
        </label>
      </div>
      <p style={{ marginTop: 6 }}>
        Hinweis: Port-Aenderungen im Web speichern die Sollwerte. Fuer die echten Docker-Ports musst du anschließend die `.env`/Compose-Werte anpassen und Container neu starten.
      </p>

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
            <input type="color" value={config[field as keyof AdminConfig] as string} onChange={(e) => setConfig({ ...config, [field]: e.target.value })} />
          </label>
        ))}
      </div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          onClick={async () => {
            await api.updateConfig(config);
            setMsg("Gespeichert.");
          }}
        >
          Speichern
        </button>
      </div>

      <h3 style={{ marginTop: 18 }}>RFID Terminals</h3>
      <div className="grid grid-2" style={{ marginBottom: 10 }}>
        <input value={terminalName} onChange={(e) => setTerminalName(e.target.value)} placeholder="Terminalname" />
        <input value={terminalLocation} onChange={(e) => setTerminalLocation(e.target.value)} placeholder="Standort (optional)" />
      </div>
      <button
        onClick={async () => {
          await api.createTerminal({ name: terminalName, location: terminalLocation || undefined });
          setTerminalName("");
          setTerminalLocation("");
          setMsg("Terminal erstellt.");
          setTerminals(await api.listTerminals());
        }}
      >
        Terminal hinzufuegen
      </button>

      <div className="grid" style={{ marginTop: 12 }}>
        {terminals.map((t) => (
          <div className="card" key={t.id} style={{ padding: 12 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <strong>{t.name}</strong>
              <span>{t.isActive ? "Aktiv" : "Deaktiviert"}</span>
            </div>
            <div>Standort: {t.location || "-"}</div>
            <div>API Key: <code>{t.apiKey}</code></div>
            <div>Letzte Aktivitaet: {t.lastSeenAt ? t.lastSeenAt.slice(0, 19).replace("T", " ") : "-"}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="secondary"
                onClick={async () => {
                  await api.updateTerminal(t.id, { isActive: !t.isActive });
                  setTerminals(await api.listTerminals());
                }}
              >
                {t.isActive ? "Deaktivieren" : "Aktivieren"}
              </button>
              <button
                className="warn"
                onClick={async () => {
                  await api.regenerateTerminalKey(t.id);
                  setMsg("Terminal-Key neu erzeugt.");
                  setTerminals(await api.listTerminals());
                }}
              >
                Key neu erzeugen
              </button>
            </div>
          </div>
        ))}
      </div>

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

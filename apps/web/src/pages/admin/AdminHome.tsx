import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import type { PublicConfig } from "../../styles/theme";
import { applyTheme } from "../../styles/theme";

type AdminConfig = {
  companyName: string;
  systemName: string;
  companyLogoUrl?: string | null;
  autoBreakMinutes: number;
  autoBreakAfterHours: number;
  colorApproved: string;
  colorRejected: string;
  colorManualCorrection: string;
  colorBreakCredit: string;
  colorSickLeave: string;
  colorHolidayOrWeekendWork: string;
  colorVacationWarning: string;
};

type Terminal = {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  apiKey: string;
  lastSeenAt?: string;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  annualVacationDays: number;
  carryOverVacationDays: number;
  loginName: string;
};

const COLOR_FIELDS: Array<{ key: keyof AdminConfig; label: string }> = [
  { key: "colorApproved", label: "Genehmigt" },
  { key: "colorRejected", label: "Abgelehnt" },
  { key: "colorManualCorrection", label: "Manuelle Korrektur" },
  { key: "colorBreakCredit", label: "Pausengutschrift" },
  { key: "colorSickLeave", label: "Krankheit" },
  { key: "colorHolidayOrWeekendWork", label: "Arbeit Feiertag/Wochenende" },
  { key: "colorVacationWarning", label: "Urlaub-Warnung" }
];

export function AdminHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section") || "company";

  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [terminalName, setTerminalName] = useState("");
  const [terminalLocation, setTerminalLocation] = useState("");
  const [msg, setMsg] = useState("");

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    loginName: "",
    password: "",
    role: "EMPLOYEE" as "EMPLOYEE" | "SUPERVISOR" | "ADMIN",
    annualVacationDays: 30,
    carryOverVacationDays: 0,
    mailNotificationsEnabled: true
  });

  async function loadData() {
    const [cfg, trms, emps] = await Promise.all([api.getConfig(), api.listTerminals(), api.employees()]);
    setConfig(cfg);
    setTerminals(trms);
    setEmployees(emps);
    applyTheme(cfg as PublicConfig);
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
  }, []);

  const sectionTitle = useMemo(() => {
    if (section === "company") return "Firmenstammdaten";
    if (section === "rules") return "Regeln";
    if (section === "colors") return "Farben";
    if (section === "employees") return "Mitarbeiter";
    if (section === "terminals") return "RFID-Terminals";
    return "Admin";
  }, [section]);

  if (!config) {
    return <div className="card">Konfiguration wird geladen...</div>;
  }

  return (
    <div className="card">
      <h2>Admin</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={() => setSearchParams({ section: "company" })}>Firmenstammdaten</button>
        <button onClick={() => setSearchParams({ section: "rules" })}>Regeln</button>
        <button onClick={() => setSearchParams({ section: "colors" })}>Farben</button>
        <button onClick={() => setSearchParams({ section: "employees" })}>Mitarbeiter</button>
        <button onClick={() => setSearchParams({ section: "terminals" })}>RFID-Terminals</button>
      </div>

      <h3>{sectionTitle}</h3>

      {section === "company" && (
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
            Firmenlogo URL
            <input value={config.companyLogoUrl || ""} onChange={(e) => setConfig({ ...config, companyLogoUrl: e.target.value })} />
          </label>
        </div>
      )}

      {section === "rules" && (
        <div className="grid grid-2">
          <label>
            Automatische Pause (Minuten)
            <input type="number" value={config.autoBreakMinutes} onChange={(e) => setConfig({ ...config, autoBreakMinutes: Number(e.target.value) })} />
          </label>
          <label>
            Pause automatisch ab (Stunden)
            <input type="number" value={config.autoBreakAfterHours} onChange={(e) => setConfig({ ...config, autoBreakAfterHours: Number(e.target.value) })} />
          </label>
        </div>
      )}

      {section === "colors" && (
        <div className="grid grid-2">
          {COLOR_FIELDS.map((field) => (
            <label key={field.key}>
              {field.label}
              <input
                type="color"
                value={config[field.key] as string}
                onChange={(e) => {
                  const updated = { ...config, [field.key]: e.target.value } as AdminConfig;
                  setConfig(updated);
                  applyTheme(updated as PublicConfig);
                }}
              />
            </label>
          ))}
        </div>
      )}

      {section === "employees" && (
        <div className="grid">
          <div className="card" style={{ padding: 12 }}>
            <h4>Neuen Mitarbeiter anlegen</h4>
            <div className="grid grid-2">
              <input placeholder="Name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} />
              <input placeholder="E-Mail" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
              <input placeholder="Loginname" value={newEmployee.loginName} onChange={(e) => setNewEmployee({ ...newEmployee, loginName: e.target.value })} />
              <input placeholder="Passwort" type="password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
              <label>
                Rolle
                <select value={newEmployee.role} onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value as "EMPLOYEE" | "SUPERVISOR" | "ADMIN" })}>
                  <option value="EMPLOYEE">Mitarbeiter</option>
                  <option value="SUPERVISOR">Vorgesetzter</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </label>
              <label>
                Mailbenachrichtigung
                <select
                  value={newEmployee.mailNotificationsEnabled ? "yes" : "no"}
                  onChange={(e) => setNewEmployee({ ...newEmployee, mailNotificationsEnabled: e.target.value === "yes" })}
                >
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              <label>
                Jahresurlaub (Tage)
                <input
                  type="number"
                  value={newEmployee.annualVacationDays}
                  onChange={(e) => setNewEmployee({ ...newEmployee, annualVacationDays: Number(e.target.value) })}
                />
              </label>
              <label>
                Resturlaub Vorjahr (Tage)
                <input
                  type="number"
                  value={newEmployee.carryOverVacationDays}
                  onChange={(e) => setNewEmployee({ ...newEmployee, carryOverVacationDays: Number(e.target.value) })}
                />
              </label>
            </div>
            <button
              style={{ marginTop: 8 }}
              onClick={async () => {
                await api.createEmployee(newEmployee);
                setMsg("Mitarbeiter angelegt.");
                setEmployees(await api.employees());
                setNewEmployee({
                  name: "",
                  email: "",
                  loginName: "",
                  password: "",
                  role: "EMPLOYEE",
                  annualVacationDays: 30,
                  carryOverVacationDays: 0,
                  mailNotificationsEnabled: true
                });
              }}
            >
              Mitarbeiter speichern
            </button>
          </div>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Login</th>
                <th>E-Mail</th>
                <th>Rolle</th>
                <th>Jahresurlaub</th>
                <th>Resturlaub</th>
                <th>Aktiv</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>{e.name}</td>
                  <td>{e.loginName}</td>
                  <td>{e.email}</td>
                  <td>{e.role}</td>
                  <td>{e.annualVacationDays}</td>
                  <td>{e.carryOverVacationDays}</td>
                  <td>{e.isActive ? "Ja" : "Nein"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {section === "terminals" && (
        <>
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
        </>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          onClick={async () => {
            await api.updateConfig(config);
            setMsg("Gespeichert.");
            const pcfg = await api.publicConfig();
            applyTheme(pcfg);
          }}
        >
          Aenderungen speichern
        </button>
      </div>

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { getSession } from "../../api/client";
import type { PublicConfig } from "../../styles/theme";
import { applyTheme } from "../../styles/theme";

type AdminConfig = {
  companyName: string;
  systemName: string;
  companyLogoUrl?: string | null;
  defaultDailyHours: number;
  defaultWeeklyWorkingDays?: string;
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
  role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
  isActive: boolean;
  annualVacationDays: number;
  carryOverVacationDays: number;
  loginName: string;
  mailNotificationsEnabled: boolean;
  webLoginEnabled: boolean;
  dailyWorkHours?: number | null;
  rfidTag?: string | null;
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
  const [logs, setLogs] = useState<Array<{ id: string; actorLoginName: string; action: string; targetType?: string; createdAt: string; payloadJson?: string }>>([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee>>({});
  const [terminalName, setTerminalName] = useState("");
  const [terminalLocation, setTerminalLocation] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const session = getSession();

  const [otUserId, setOtUserId] = useState("");
  const [otDate, setOtDate] = useState("");
  const [otHours, setOtHours] = useState(0);
  const [otNote, setOtNote] = useState("");

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    loginName: "",
    password: "",
    role: "EMPLOYEE" as "EMPLOYEE" | "SUPERVISOR" | "ADMIN",
    annualVacationDays: 30,
    dailyWorkHours: 8,
    carryOverVacationDays: 0,
    mailNotificationsEnabled: true,
    webLoginEnabled: true,
    rfidTag: ""
  });

  async function loadData() {
    const [cfg, trms, emps] = await Promise.all([api.getConfig(), api.listTerminals(), api.employees()]);
    setConfig(cfg);
    setTerminals(trms);
    setEmployees(emps as Employee[]);
    setOtUserId((prev) => prev || (emps[0]?.id ?? ""));
    applyTheme(cfg as PublicConfig);
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    if (section === "logs") {
      api.listAuditLogs().then(setLogs).catch((e) => setMsg((e as Error).message));
    }
  }, [section]);

  const sectionTitle = useMemo(() => {
    if (section === "company") return "Firmenstammdaten";
    if (section === "rules") return "Regeln";
    if (section === "colors") return "Farben";
    if (section === "employees") return "Mitarbeiter";
    if (section === "overtime") return "Ueberstunden";
    if (section === "terminals") return "RFID-Terminals";
    if (section === "logs") return "Log";
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
        <button onClick={() => setSearchParams({ section: "overtime" })}>Ueberstunden</button>
        <button onClick={() => setSearchParams({ section: "terminals" })}>RFID-Terminals</button>
        <button onClick={() => setSearchParams({ section: "logs" })}>Log</button>
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
            Firmenlogo hochladen (PNG/JPG)
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            <button className="secondary" type="button" style={{ marginTop: 6 }} onClick={async () => {
              try {
                if (!logoFile) {
                  setMsg("Bitte zuerst eine Datei waehlen.");
                  return;
                }
                const buffer = await logoFile.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const uploaded = await api.uploadLogo({ filename: logoFile.name, contentBase64: base64 });
                setConfig({ ...config, companyLogoUrl: uploaded.logoUrl });
                setMsg("Logo hochgeladen.");
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}>Logo hochladen</button>
          </label>
        </div>
      )}

      {section === "rules" && (
        <div className="grid grid-2">
          <label>
            Standard Sollarbeitszeit/Tag (wenn Mitarbeiterwert leer)
            <input type="number" step="0.25" value={config.defaultDailyHours} onChange={(e) => setConfig({ ...config, defaultDailyHours: Number(e.target.value) })} />
          </label>
          <label>
            Automatische Pause (Minuten)
            <input type="number" value={config.autoBreakMinutes} onChange={(e) => setConfig({ ...config, autoBreakMinutes: Number(e.target.value) })} />
          </label>
          <label>
            Pause automatisch ab (Stunden)
            <input type="number" value={config.autoBreakAfterHours} onChange={(e) => setConfig({ ...config, autoBreakAfterHours: Number(e.target.value) })} />
          </label>
          <label>
            Arbeitstage
            <div className="row">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => {
                const set = new Set((config.defaultWeeklyWorkingDays || "MON,TUE,WED,THU,FRI").split(",").filter(Boolean));
                const active = set.has(d);
                return (
                  <button
                    type="button"
                    key={d}
                    className={active ? "" : "secondary"}
                    onClick={() => {
                      if (active) set.delete(d); else set.add(d);
                      setConfig({ ...config, defaultWeeklyWorkingDays: Array.from(set).join(",") });
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
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

      {section === "overtime" && (
        <div className="card" style={{ padding: 12 }}>
          <h4>Ueberstunden bearbeiten</h4>
          <div className="grid grid-2">
            <label>
              Mitarbeiter
              <select value={otUserId} onChange={(e) => setOtUserId(e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.loginName})</option>
                ))}
              </select>
            </label>
            <label>
              Datum
              <input type="date" value={otDate} onChange={(e) => setOtDate(e.target.value)} />
            </label>
            <label>
              Stunden (+/-)
              <input type="number" step="0.25" value={otHours} onChange={(e) => setOtHours(Number(e.target.value))} />
            </label>
            <label>
              Notiz (Pflicht)
              <textarea value={otNote} onChange={(e) => setOtNote(e.target.value)} />
            </label>
          </div>
          <button
            style={{ marginTop: 8 }}
            onClick={async () => {
              try {
                if (!otNote.trim()) {
                  setMsg("Notiz ist Pflicht.");
                  return;
                }
                await api.createOvertimeAdjustment({ userId: otUserId, date: otDate, hours: otHours, note: otNote.trim() });
                setMsg("Ueberstundenanpassung gespeichert.");
                setOtHours(0);
                setOtNote("");
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Ueberstunden speichern
          </button>
        </div>
      )}

      {section === "logs" && (
        <table>
          <thead>
            <tr>
              <th>Zeit</th>
              <th>Loginname</th>
              <th>Aktion</th>
              <th>Ziel</th>
              <th>Daten</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString("de-DE")}</td>
                <td>{l.actorLoginName}</td>
                <td>{l.action}</td>
                <td>{l.targetType || "-"}</td>
                <td style={{ maxWidth: 340, wordBreak: "break-word" }}>{l.payloadJson || "-"}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr>
                <td colSpan={5}>Keine Logeintraege.</td>
              </tr>
            )}
          </tbody>
        </table>
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
                  {session?.user.role === "ADMIN" && <option value="SUPERVISOR">Vorgesetzter</option>}
                  {session?.user.role === "ADMIN" && <option value="ADMIN">Admin</option>}
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
                Sollarbeitszeit/Tag (h)
                <input type="number" step="0.25" value={newEmployee.dailyWorkHours} onChange={(e) => setNewEmployee({ ...newEmployee, dailyWorkHours: Number(e.target.value) })} />
              </label>
              <label>
                Resturlaub Vorjahr (Tage)
                <input
                  type="number"
                  value={newEmployee.carryOverVacationDays}
                  onChange={(e) => setNewEmployee({ ...newEmployee, carryOverVacationDays: Number(e.target.value) })}
                />
              </label>
              <label>
                Weblogin aktiviert
                <select value={newEmployee.webLoginEnabled ? "yes" : "no"} onChange={(e) => setNewEmployee({ ...newEmployee, webLoginEnabled: e.target.value === "yes" })}>
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              <label>
                RFID Tag
                <input value={newEmployee.rfidTag} onChange={(e) => setNewEmployee({ ...newEmployee, rfidTag: e.target.value })} />
              </label>
            </div>
            <button
              style={{ marginTop: 8 }}
              onClick={async () => {
                try {
                  await api.createEmployee({
                    ...newEmployee,
                    rfidTag: newEmployee.rfidTag.trim() ? newEmployee.rfidTag.trim() : undefined
                  });
                  setMsg("Mitarbeiter angelegt.");
                  setEmployees((await api.employees()) as Employee[]);
                  setNewEmployee({
                    name: "",
                    email: "",
                    loginName: "",
                    password: "",
                    role: "EMPLOYEE",
                    annualVacationDays: 30,
                    dailyWorkHours: 8,
                    carryOverVacationDays: 0,
                    mailNotificationsEnabled: true,
                    webLoginEnabled: true,
                    rfidTag: ""
                  });
                } catch (e) {
                  setMsg((e as Error).message);
                }
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
                <th>Soll/Tag</th>
                <th>RFID</th>
                <th>Weblogin</th>
                <th>Aktiv</th>
                <th>Aktion</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => {
                const editing = editingEmployeeId === e.id;
                return (
                  <tr key={e.id}>
                    <td>{editing ? <input value={editingEmployee.name ?? e.name} onChange={(ev) => setEditingEmployee({ ...editingEmployee, name: ev.target.value })} /> : e.name}</td>
                    <td>{e.loginName}</td>
                    <td>{editing ? <input value={editingEmployee.email ?? e.email} onChange={(ev) => setEditingEmployee({ ...editingEmployee, email: ev.target.value })} /> : e.email}</td>
                    <td>
                      {editing ? (
                        <select value={(editingEmployee.role ?? e.role) as string} onChange={(ev) => setEditingEmployee({ ...editingEmployee, role: ev.target.value as Employee["role"] })}>
                          <option value="EMPLOYEE">Mitarbeiter</option>
                          <option value="SUPERVISOR">Vorgesetzter</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                      ) : (
                        e.role
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          step="0.25"
                          value={editingEmployee.dailyWorkHours ?? e.dailyWorkHours ?? 8}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, dailyWorkHours: Number(ev.target.value) })}
                        />
                      ) : (
                        (e.dailyWorkHours ?? 8).toFixed(2)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          value={editingEmployee.rfidTag ?? e.rfidTag ?? ""}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, rfidTag: ev.target.value })}
                        />
                      ) : (
                        e.rfidTag || "-"
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.webLoginEnabled ?? e.webLoginEnabled)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, webLoginEnabled: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.webLoginEnabled ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={editingEmployee.annualVacationDays ?? e.annualVacationDays}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, annualVacationDays: Number(ev.target.value) })}
                        />
                      ) : (
                        e.annualVacationDays
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={editingEmployee.carryOverVacationDays ?? e.carryOverVacationDays}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, carryOverVacationDays: Number(ev.target.value) })}
                        />
                      ) : (
                        e.carryOverVacationDays
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.isActive ?? e.isActive)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, isActive: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.isActive ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {!editing && (
                        <button
                          className="secondary"
                          onClick={() => {
                            setEditingEmployeeId(e.id);
                            setEditingEmployee({
                              name: e.name,
                              email: e.email,
                              role: e.role,
                              annualVacationDays: e.annualVacationDays,
                              dailyWorkHours: e.dailyWorkHours,
                              carryOverVacationDays: e.carryOverVacationDays,
                              isActive: e.isActive,
                              mailNotificationsEnabled: e.mailNotificationsEnabled,
                              webLoginEnabled: e.webLoginEnabled,
                              rfidTag: e.rfidTag
                            });
                          }}
                        >
                          Bearbeiten
                        </button>
                      )}
                      {editing && (
                        <div className="row">
                          <button
                            onClick={async () => {
                              try {
                                await api.updateEmployee(e.id, {
                                  ...editingEmployee,
                                  rfidTag: typeof editingEmployee.rfidTag === "string" && editingEmployee.rfidTag.trim() === "" ? null : editingEmployee.rfidTag
                                });
                                setMsg("Mitarbeiter aktualisiert.");
                                setEditingEmployeeId(null);
                                setEditingEmployee({});
                                setEmployees((await api.employees()) as Employee[]);
                              } catch (err) {
                                setMsg((err as Error).message);
                              }
                            }}
                          >
                            Speichern
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditingEmployeeId(null);
                              setEditingEmployee({});
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
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
              try {
                await api.createTerminal({ name: terminalName, location: terminalLocation || undefined });
                setTerminalName("");
                setTerminalLocation("");
                setMsg("Terminal erstellt.");
                setTerminals(await api.listTerminals());
              } catch (e) {
                setMsg((e as Error).message);
              }
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
                <div>
                  API Key: <code>{t.apiKey}</code>
                </div>
                <div>Letzte Aktivitaet: {t.lastSeenAt ? t.lastSeenAt.slice(0, 19).replace("T", " ") : "-"}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await api.updateTerminal(t.id, { isActive: !t.isActive });
                        setTerminals(await api.listTerminals());
                      } catch (e) {
                        setMsg((e as Error).message);
                      }
                    }}
                  >
                    {t.isActive ? "Deaktivieren" : "Aktivieren"}
                  </button>
                  <button
                    className="warn"
                    onClick={async () => {
                      try {
                        await api.regenerateTerminalKey(t.id);
                        setMsg("Terminal-Key neu erzeugt.");
                        setTerminals(await api.listTerminals());
                      } catch (e) {
                        setMsg((e as Error).message);
                      }
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
            try {
              await api.updateConfig(config);
              setMsg("Gespeichert.");
              const pcfg = await api.publicConfig();
              applyTheme(pcfg);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Aenderungen speichern
        </button>
      </div>

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

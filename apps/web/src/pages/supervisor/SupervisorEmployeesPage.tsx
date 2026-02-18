import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

type Employee = {
  id: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "AZUBI" | "SUPERVISOR" | "ADMIN";
  isActive: boolean;
  annualVacationDays: number;
  carryOverVacationDays: number;
  loginName: string;
  mailNotificationsEnabled: boolean;
  webLoginEnabled: boolean;
  dailyWorkHours?: number | null;
};

export function SupervisorEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Employee>>({});
  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    loginName: "",
    password: "",
    annualVacationDays: 30,
    dailyWorkHours: 8,
    carryOverVacationDays: 0,
    mailNotificationsEnabled: true,
    webLoginEnabled: true,
    role: "EMPLOYEE" as "EMPLOYEE" | "AZUBI"
  });

  async function load() {
    const rows = await api.employees();
    setEmployees(rows as Employee[]);
  }

  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Mitarbeiter</h2>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <h4>Neuen Mitarbeiter anlegen</h4>
        <div className="grid grid-2">
          <input placeholder="Name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} />
          <input placeholder="E-Mail" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
          <input placeholder="Loginname" value={newEmployee.loginName} onChange={(e) => setNewEmployee({ ...newEmployee, loginName: e.target.value })} />
          <input placeholder="Passwort" type="password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Passwort: mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen.</div>
          <label>
            Jahresurlaub (Tage)
            <input type="number" value={newEmployee.annualVacationDays} onChange={(e) => setNewEmployee({ ...newEmployee, annualVacationDays: Number(e.target.value) })} />
          </label>
          <label>
            Sollarbeitszeit/Tag (h)
            <input type="number" step="0.25" value={newEmployee.dailyWorkHours} onChange={(e) => setNewEmployee({ ...newEmployee, dailyWorkHours: Number(e.target.value) })} />
          </label>
          <label>
            Resturlaub Vorjahr (Tage)
            <input type="number" value={newEmployee.carryOverVacationDays} onChange={(e) => setNewEmployee({ ...newEmployee, carryOverVacationDays: Number(e.target.value) })} />
          </label>
          <label>
            Weblogin aktiviert
            <select value={newEmployee.webLoginEnabled ? "yes" : "no"} onChange={(e) => setNewEmployee({ ...newEmployee, webLoginEnabled: e.target.value === "yes" })}>
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
          <label>
            Mailbenachrichtigung
            <select value={newEmployee.mailNotificationsEnabled ? "yes" : "no"} onChange={(e) => setNewEmployee({ ...newEmployee, mailNotificationsEnabled: e.target.value === "yes" })}>
              <option value="yes">Ja</option>
              <option value="no">Nein</option>
            </select>
          </label>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>E-Mail ist nur Pflicht, wenn Mailbenachrichtigung = Ja.</div>
          <label>
            Rolle
            <select value={newEmployee.role} onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value as "EMPLOYEE" | "AZUBI" })}>
              <option value="EMPLOYEE">Mitarbeiter</option>
              <option value="AZUBI">AZUBI</option>
            </select>
          </label>
        </div>
        <button
          style={{ marginTop: 8 }}
          onClick={async () => {
            try {
              if (!/^.{8,}$/.test(newEmployee.password) || !/([0-9]|[^A-Za-z0-9])/.test(newEmployee.password)) {
                setMsg("Passwort muss mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen enthalten.");
                return;
              }
              if (newEmployee.mailNotificationsEnabled && !newEmployee.email.trim()) {
                setMsg("E-Mail ist Pflicht, wenn Mailbenachrichtigung aktiv ist.");
                return;
              }
              await api.createEmployee({
                ...newEmployee,
                email: newEmployee.email.trim() || undefined,
                annualVacationDays: Number.isFinite(Number(newEmployee.annualVacationDays)) ? Number(newEmployee.annualVacationDays) : 30,
                dailyWorkHours: Number.isFinite(Number(newEmployee.dailyWorkHours)) ? Number(newEmployee.dailyWorkHours) : 8,
                carryOverVacationDays: Number.isFinite(Number(newEmployee.carryOverVacationDays)) ? Number(newEmployee.carryOverVacationDays) : 0,
                mailNotificationsEnabled: newEmployee.mailNotificationsEnabled
              });
              setMsg("Mitarbeiter angelegt.");
              setNewEmployee({
                name: "",
                email: "",
                loginName: "",
                password: "",
                annualVacationDays: 30,
                dailyWorkHours: 8,
                carryOverVacationDays: 0,
                mailNotificationsEnabled: true,
                webLoginEnabled: true,
                role: "EMPLOYEE"
              });
              await load();
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
            <th>Rolle</th>
            <th>Login</th>
            <th>E-Mail</th>
            <th>Jahresurlaub</th>
            <th>Resturlaub</th>
            <th>Soll/Tag</th>
            <th>Weblogin</th>
            <th>Aktiv</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const isEdit = editingId === e.id;
            const canEdit = e.role === "EMPLOYEE" || e.role === "AZUBI";
            return (
              <tr key={e.id}>
                <td>{isEdit ? <input value={editing.name ?? e.name} onChange={(ev) => setEditing({ ...editing, name: ev.target.value })} /> : e.name}</td>
                <td>{e.role}</td>
                <td>{e.loginName}</td>
                <td>{isEdit ? <input value={editing.email ?? e.email} onChange={(ev) => setEditing({ ...editing, email: ev.target.value })} /> : e.email}</td>
                <td>{isEdit ? <input type="number" value={editing.annualVacationDays ?? e.annualVacationDays} onChange={(ev) => setEditing({ ...editing, annualVacationDays: Number(ev.target.value) })} /> : e.annualVacationDays}</td>
                <td>{isEdit ? <input type="number" value={editing.carryOverVacationDays ?? e.carryOverVacationDays} onChange={(ev) => setEditing({ ...editing, carryOverVacationDays: Number(ev.target.value) })} /> : e.carryOverVacationDays}</td>
                <td>{isEdit ? <input type="number" step="0.25" value={editing.dailyWorkHours ?? e.dailyWorkHours ?? 8} onChange={(ev) => setEditing({ ...editing, dailyWorkHours: Number(ev.target.value) })} /> : (e.dailyWorkHours ?? 8).toFixed(2)}</td>
                <td>
                  {isEdit ? (
                    <select value={String(editing.webLoginEnabled ?? e.webLoginEnabled)} onChange={(ev) => setEditing({ ...editing, webLoginEnabled: ev.target.value === "true" })}>
                      <option value="true">Ja</option>
                      <option value="false">Nein</option>
                    </select>
                  ) : e.webLoginEnabled ? "Ja" : "Nein"}
                </td>
                <td>
                  {isEdit ? (
                    <select value={String(editing.isActive ?? e.isActive)} onChange={(ev) => setEditing({ ...editing, isActive: ev.target.value === "true" })}>
                      <option value="true">Ja</option>
                      <option value="false">Nein</option>
                    </select>
                  ) : e.isActive ? "Ja" : "Nein"}
                </td>
                <td>
                  {!isEdit && canEdit && <button className="secondary" onClick={() => { setEditingId(e.id); setEditing(e); }}>Bearbeiten</button>}
                  {!isEdit && !canEdit && <span>Nur Ansicht</span>}
                  {isEdit && (
                    <div className="row">
                      <button onClick={async () => {
                        try {
                          await api.updateEmployee(e.id, editing);
                          setEditingId(null);
                          setEditing({});
                          setMsg("Mitarbeiter aktualisiert.");
                          await load();
                        } catch (err) {
                          setMsg((err as Error).message);
                        }
                      }}>Speichern</button>
                      <button className="secondary" onClick={() => { setEditingId(null); setEditing({}); }}>Abbrechen</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {employees.length === 0 && <tr><td colSpan={10}>Keine Mitarbeiter.</td></tr>}
        </tbody>
      </table>

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

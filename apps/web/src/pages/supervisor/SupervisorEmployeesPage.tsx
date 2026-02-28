import React, { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, getSession } from "../../api/client";

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
  mobileQrEnabled?: boolean;
  mobileQrExpiresAt?: string | null;
};

export function SupervisorEmployeesPage() {
  const session = getSession();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [msg, setMsg] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<Employee>>({});
  const [mobileQrDays, setMobileQrDays] = useState(180);
  const [mobileQrPreview, setMobileQrPreview] = useState<{
    userId: string;
    employeeName: string;
    loginName: string;
    expiresAt: string;
    token: string;
    payload: string;
    qrDataUrl: string;
  } | null>(null);
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
        <div className="grid admin-uniform">
          <label>
            Name
            <input placeholder="Name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} />
          </label>
          <label>
            E-Mail
            <input placeholder="E-Mail" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
          </label>
          <label>
            Loginname
            <input placeholder="Loginname" value={newEmployee.loginName} onChange={(e) => setNewEmployee({ ...newEmployee, loginName: e.target.value })} />
          </label>
          <label>
            Passwort
            <input placeholder="Passwort" type="password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
          </label>
          <div style={{ gridColumn: "1 / -1", color: "var(--muted)", fontSize: 12 }}>Passwort: mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen.</div>
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
          <div style={{ gridColumn: "1 / -1", color: "var(--muted)", fontSize: 12 }}>E-Mail ist nur Pflicht, wenn Mailbenachrichtigung = Ja.</div>
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
            <th>QR</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e) => {
            const isEdit = editingId === e.id;
            const canEdit = e.role === "EMPLOYEE" || e.role === "AZUBI";
            const canResetPassword = session?.user.role === "ADMIN" || canEdit || e.id === session?.user.id;
            const canManageQr = session?.user.role === "ADMIN" || canEdit || e.id === session?.user.id;
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
                  {e.mobileQrEnabled
                    ? `Aktiv bis ${e.mobileQrExpiresAt ? new Date(e.mobileQrExpiresAt).toLocaleDateString("de-DE") : "-"}`
                    : "Deaktiviert"}
                </td>
                <td>
                  {!isEdit && canEdit && (
                    <div className="row">
                      <button className="secondary" onClick={() => { setEditingId(e.id); setEditing(e); }}>Bearbeiten</button>
                      {canResetPassword && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const p1 = window.prompt(`Neues Passwort fuer ${e.name} eingeben:`, "");
                              if (!p1) return;
                              const p2 = window.prompt("Passwort wiederholen:", "");
                              if (p1 !== p2) {
                                setMsg("Passwoerter stimmen nicht ueberein.");
                                return;
                              }
                              if (!/^.{8,}$/.test(p1) || !/([0-9]|[^A-Za-z0-9])/.test(p1)) {
                                setMsg("Passwort muss mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen enthalten.");
                                return;
                              }
                              await api.resetEmployeePassword(e.id, { newPassword: p1 });
                              setMsg(`Passwort fuer ${e.name} wurde zurueckgesetzt.`);
                            } catch (err) {
                              setMsg((err as Error).message);
                            }
                          }}
                        >
                          Passwort reset
                        </button>
                      )}
                      {canManageQr && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const generated = await api.generateMobileQr({
                                userId: e.id,
                                expiresInDays: mobileQrDays
                              });
                              const qrDataUrl = await QRCode.toDataURL(generated.payload, { margin: 1, width: 512 });
                              setMobileQrPreview({
                                userId: e.id,
                                employeeName: generated.employeeName,
                                loginName: generated.loginName,
                                expiresAt: generated.expiresAt,
                                token: generated.token,
                                payload: generated.payload,
                                qrDataUrl
                              });
                              setMsg(e.mobileQrEnabled ? `QR-Code fuer ${e.name} neu angezeigt.` : `QR-Code fuer ${e.name} erstellt.`);
                              await load();
                            } catch (err) {
                              setMsg((err as Error).message);
                            }
                          }}
                        >
                          {e.mobileQrEnabled ? "QR-Code anzeigen" : "QR-Code erstellen"}
                        </button>
                      )}
                      {canManageQr && e.mobileQrEnabled && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const ok = window.confirm(`QR-Code fuer ${e.name} wirklich loeschen?`);
                              if (!ok) return;
                              await api.revokeMobileQr({ userId: e.id });
                              setMsg(`QR-Code fuer ${e.name} geloescht.`);
                              if (mobileQrPreview?.userId === e.id) setMobileQrPreview(null);
                              await load();
                            } catch (err) {
                              setMsg((err as Error).message);
                            }
                          }}
                        >
                          QR-Code loeschen
                        </button>
                      )}
                    </div>
                  )}
                  {!isEdit && !canEdit && canResetPassword && (
                    <div className="row">
                      <button
                        className="secondary"
                        onClick={async () => {
                          try {
                            const p1 = window.prompt(`Neues Passwort fuer ${e.name} eingeben:`, "");
                            if (!p1) return;
                            const p2 = window.prompt("Passwort wiederholen:", "");
                            if (p1 !== p2) {
                              setMsg("Passwoerter stimmen nicht ueberein.");
                              return;
                            }
                            if (!/^.{8,}$/.test(p1) || !/([0-9]|[^A-Za-z0-9])/.test(p1)) {
                              setMsg("Passwort muss mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen enthalten.");
                              return;
                            }
                            await api.resetEmployeePassword(e.id, { newPassword: p1 });
                            setMsg(`Passwort fuer ${e.name} wurde zurueckgesetzt.`);
                          } catch (err) {
                            setMsg((err as Error).message);
                          }
                        }}
                      >
                        Passwort reset
                      </button>
                      {canManageQr && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const generated = await api.generateMobileQr({
                                userId: e.id,
                                expiresInDays: mobileQrDays
                              });
                              const qrDataUrl = await QRCode.toDataURL(generated.payload, { margin: 1, width: 512 });
                              setMobileQrPreview({
                                userId: e.id,
                                employeeName: generated.employeeName,
                                loginName: generated.loginName,
                                expiresAt: generated.expiresAt,
                                token: generated.token,
                                payload: generated.payload,
                                qrDataUrl
                              });
                              setMsg(e.mobileQrEnabled ? `QR-Code fuer ${e.name} neu angezeigt.` : `QR-Code fuer ${e.name} erstellt.`);
                              await load();
                            } catch (err) {
                              setMsg((err as Error).message);
                            }
                          }}
                        >
                          {e.mobileQrEnabled ? "QR-Code anzeigen" : "QR-Code erstellen"}
                        </button>
                      )}
                      {canManageQr && e.mobileQrEnabled && (
                        <button
                          className="secondary"
                          onClick={async () => {
                            try {
                              const ok = window.confirm(`QR-Code fuer ${e.name} wirklich loeschen?`);
                              if (!ok) return;
                              await api.revokeMobileQr({ userId: e.id });
                              setMsg(`QR-Code fuer ${e.name} geloescht.`);
                              if (mobileQrPreview?.userId === e.id) setMobileQrPreview(null);
                              await load();
                            } catch (err) {
                              setMsg((err as Error).message);
                            }
                          }}
                        >
                          QR-Code loeschen
                        </button>
                      )}
                    </div>
                  )}
                  {!isEdit && !canEdit && !canResetPassword && <span>Nur Ansicht</span>}
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
          {employees.length === 0 && <tr><td colSpan={11}>Keine Mitarbeiter.</td></tr>}
        </tbody>
      </table>

      <div className="row" style={{ marginTop: 10 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          QR Gueltigkeit (Tage)
          <input type="number" min={1} max={3650} value={mobileQrDays} onChange={(e) => setMobileQrDays(Math.min(3650, Math.max(1, Number(e.target.value) || 180)))} style={{ width: 110 }} />
        </label>
      </div>

      {mobileQrPreview && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            zIndex: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16
          }}
          onClick={() => setMobileQrPreview(null)}
        >
          <div className="card" style={{ width: "min(920px, 100%)", maxHeight: "92vh", overflow: "auto" }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Mobile QR Login</h3>
            <div><strong>Mitarbeiter:</strong> {mobileQrPreview.employeeName} ({mobileQrPreview.loginName})</div>
            <div><strong>Gueltig bis:</strong> {new Date(mobileQrPreview.expiresAt).toLocaleString("de-DE")}</div>
            <div className="row" style={{ alignItems: "flex-start", marginTop: 10 }}>
              <img src={mobileQrPreview.qrDataUrl} alt="Mobile Login QR" style={{ width: 260, height: 260, border: "1px solid var(--border)", borderRadius: 8, background: "#fff", padding: 8 }} />
              <div className="grid" style={{ minWidth: 320, flex: 1 }}>
                <label>
                  QR Payload
                  <textarea readOnly value={mobileQrPreview.payload} style={{ minHeight: 180 }} />
                </label>
                <div className="row">
                  <button className="secondary" onClick={async () => {
                    try { await navigator.clipboard.writeText(mobileQrPreview.payload); setMsg("QR Payload in Zwischenablage kopiert."); } catch { setMsg("Konnte nicht in Zwischenablage kopieren."); }
                  }}>Payload kopieren</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      const w = window.open("", "_blank", "width=820,height=980");
                      if (!w) { setMsg("Druckfenster konnte nicht geoeffnet werden."); return; }
                      const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                      w.document.open();
                      w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Mobile QR</title><style>body{font-family:Arial,sans-serif;padding:24px}h1{margin:0 0 8px}img{width:320px;height:320px;border:1px solid #ddd;padding:8px;border-radius:8px;background:#fff}.meta{margin:8px 0 16px;color:#111}.payload{margin-top:14px;font-family:monospace;white-space:pre-wrap;word-break:break-all;border:1px solid #ddd;padding:10px;border-radius:8px}</style></head><body><h1>Mobile QR Login</h1><div class="meta"><strong>Mitarbeiter:</strong> ${esc(mobileQrPreview.employeeName)} (${esc(mobileQrPreview.loginName)})<br/><strong>Gueltig bis:</strong> ${esc(new Date(mobileQrPreview.expiresAt).toLocaleString("de-DE"))}</div><img src="${mobileQrPreview.qrDataUrl}" alt="QR"/><div class="payload">${esc(mobileQrPreview.payload)}</div></body></html>`);
                      w.document.close();
                      w.focus();
                      setTimeout(() => w.print(), 250);
                    }}
                  >
                    Drucken
                  </button>
                  <button className="secondary" onClick={() => setMobileQrPreview(null)}>Schliessen</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

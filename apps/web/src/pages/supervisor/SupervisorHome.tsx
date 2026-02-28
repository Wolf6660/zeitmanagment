import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

function sourceLabel(source: string): string {
  if (source === "WEB") return "Web";
  if (source === "RFID_TERMINAL") return "RFID-Terminal";
  if (source === "MANUAL_CORRECTION") return "Manueller Nachtrag";
  if (source === "BULK_ENTRY") return "Stapelerfassung";
  if (source === "SUPERVISOR_CORRECTION") return "Korrektur Vorgesetzter";
  return source;
}

function formatBerlinTime(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

export function SupervisorHome() {
  const session = getSession();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; loginName?: string; role: string; annualVacationDays: number; carryOverVacationDays: number }>>([]);
  const [overview, setOverview] = useState<Record<string, { istHours: number; sollHours: number; overtimeHours: number }>>({});
  const [monthPlannedText, setMonthPlannedText] = useState("");
  const [vacationAvailable, setVacationAvailable] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Array<{ id: string; kind: string; startDate: string; endDate: string; note?: string; requestedAt: string; userId: string; availableVacationDays: number; requestedWorkingDays: number; remainingVacationAfterRequest: number; availableOvertimeHours: number; user: { name: string } }>>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editFrom, setEditFrom] = useState<Record<string, string>>({});
  const [editTo, setEditTo] = useState<Record<string, string>>({});
  const [editKind, setEditKind] = useState<Record<string, "VACATION" | "OVERTIME">>({});
  const [msg, setMsg] = useState("");
  const [specialPending, setSpecialPending] = useState<Array<{ id: string; userId: string; date: string; createdAt: string; eventType?: string; clockInTimes?: string[]; clockOutTimes?: string[]; workedHours?: number; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note?: string; user: { id: string; name: string; loginName: string } }>>([]);
  const [breakPending, setBreakPending] = useState<Array<{ id: string; userId: string; date: string; minutes: number; reason: string; status: "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELED"; requestedAt: string; user: { id: string; name: string; loginName: string } }>>([]);
  const [specialNotes, setSpecialNotes] = useState<Record<string, string>>({});
  const [breakNotes, setBreakNotes] = useState<Record<string, string>>({});
  const [reasonText, setReasonText] = useState("");
  const [todayEntries, setTodayEntries] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string }>>([]);
  const [todayOverview, setTodayOverview] = useState<Array<{ id: string; userId: string; userName: string; loginName: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string | null }>>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [manualIn, setManualIn] = useState("");
  const [manualOut, setManualOut] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [maxBackDays, setMaxBackDays] = useState(3);

  async function loadData() {
    if (!session) return;
    const [e, p, ov, sp, bp, t, to] = await Promise.all([
      api.employees(),
      api.pendingLeaves(),
      api.supervisorOverview(),
      api.pendingSpecialWork(),
      api.pendingBreakCreditRequests(),
      api.todayEntries(session.user.id),
      api.todayOverview()
    ]);
    setEmployees(e);
    setPending(p);
    setOverview(Object.fromEntries(ov.rows.map((x) => [x.userId, { istHours: x.istHours, sollHours: x.sollHours, overtimeHours: x.overtimeHours }])));
    setMonthPlannedText(`${ov.monthLabel} - ${ov.monthPlannedHours.toFixed(2)} Stunden`);
    setSpecialPending(sp);
    setBreakPending(bp);
    setTodayEntries(t);
    setTodayOverview(to);
    const vacRows = await Promise.all(
      e.map(async (emp) => {
        const v = await api.leaveAvailability(emp.id);
        return [emp.id, v.availableVacationDays] as const;
      })
    );
    setVacationAvailable(Object.fromEntries(vacRows));
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    api.publicConfig()
      .then((cfg) => setMaxBackDays(cfg.selfCorrectionMaxDays ?? 3))
      .catch(() => setMaxBackDays(3));
  }, []);

  useEffect(() => {
    if (manualMode && !manualDate) {
      setManualDate(new Date().toISOString().slice(0, 10));
    }
  }, [manualMode, manualDate]);

  return (
    <div className="layout-1-2">
      <div className="card">
        <h2>Eigene Stempeluhr</h2>
        <div className="grid">
          <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Grund / Kommentar (Pflicht)" />
          <div className="row">
            <button className="btn-clock-in" onClick={async () => {
              try {
                if (!reasonText.trim()) { setMsg("Grund ist Pflicht."); return; }
                await api.clock({ type: "CLOCK_IN", reasonText });
                await loadData();
                setMsg("Kommen gestempelt.");
              } catch (e) { setMsg((e as Error).message); }
            }}>Kommen</button>
            <button className="btn-clock-out" onClick={async () => {
              try {
                if (!reasonText.trim()) { setMsg("Grund ist Pflicht."); return; }
                await api.clock({ type: "CLOCK_OUT", reasonText });
                await loadData();
                setMsg("Gehen gestempelt.");
              } catch (e) { setMsg((e as Error).message); }
            }}>Gehen</button>
          </div>
          <button className="btn-manual" onClick={() => setManualMode((m) => !m)}>
            {manualMode ? "Nachtragen schliessen" : "Nachtrag"}
          </button>
          {manualMode && (
            <div className="card" style={{ padding: 10 }}>
              <strong>Zeiten nachtragen</strong>
              <div style={{ color: "var(--muted)" }}>Rueckwirkend bis {maxBackDays} Tage, nie in die Zukunft.</div>
              <div className="grid" style={{ marginTop: 8 }}>
                <label>
                  Datum
                  <input
                    type="date"
                    value={manualDate}
                    onChange={(e) => setManualDate(e.target.value)}
                    max={new Date().toISOString().slice(0, 10)}
                    min={new Date(Date.now() - maxBackDays * 86400000).toISOString().slice(0, 10)}
                  />
                </label>
                <label>
                  Kommen
                  <input type="time" step={60} value={manualIn} onChange={(e) => setManualIn(e.target.value.slice(0, 5))} />
                </label>
                <label>
                  Gehen
                  <input type="time" step={60} value={manualOut} onChange={(e) => setManualOut(e.target.value.slice(0, 5))} />
                </label>
                <textarea placeholder="Notiz (Pflichtfeld)" value={manualNote} onChange={(e) => setManualNote(e.target.value)} />
                <button
                  className="btn-manual"
                  onClick={async () => {
                    try {
                      if (!manualNote.trim()) { setMsg("Notiz ist Pflicht."); return; }
                      if (!manualDate) { setMsg("Datum ist Pflicht."); return; }
                      const events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> = [];
                      if (manualIn) events.push({ type: "CLOCK_IN", time: manualIn.slice(0, 5) });
                      if (manualOut) events.push({ type: "CLOCK_OUT", time: manualOut.slice(0, 5) });
                      if (events.length === 0) { setMsg("Mindestens eine Zeit ist erforderlich."); return; }
                      await api.dayOverrideSelf({ date: manualDate, note: manualNote.trim(), events });
                      setMsg("Nachtrag gespeichert.");
                      await loadData();
                    } catch (e) {
                      setMsg((e as Error).message);
                    }
                  }}
                >
                  Nachtrag speichern
                </button>
              </div>
            </div>
          )}
          <div className="card" style={{ padding: 10 }}>
            <strong>Heute erfasst</strong>
            {todayEntries.length === 0 && <div>Keine Ereignisse heute.</div>}
            {todayEntries.map((e) => (
              <div
                key={e.id}
                style={{
                  background:
                    e.source === "WEB"
                      ? "color-mix(in srgb, var(--web-entry) 20%, white)"
                      : e.source === "BULK_ENTRY"
                        ? "color-mix(in srgb, var(--bulk-entry) 20%, white)"
                        : e.source === "MANUAL_CORRECTION"
                          ? "color-mix(in srgb, var(--manual) 16%, white)"
                          : "transparent",
                  borderRadius: 8,
                  padding: "4px 6px"
                }}
              >
                {e.type === "CLOCK_IN" ? "Kommen" : "Gehen"} {formatBerlinTime(e.occurredAt)}
                {e.reasonText ? ` - ${e.reasonText}` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Uebersicht Mitarbeiter</h2>
        {monthPlannedText && <div style={{ marginBottom: 8, color: "var(--muted)", fontWeight: 600 }}>Monat Sollstunden: {monthPlannedText}</div>}
        <table>
          <thead>
            <tr><th>Name</th><th>Rolle</th><th>Ist-Stunden</th><th>Ueberstunden</th><th>Vorhandener Urlaub</th></tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.role}</td>
                <td>{(overview[e.id]?.istHours ?? 0).toFixed(2)} h</td>
                <td style={{ color: "var(--overtime)" }}>{(overview[e.id]?.overtimeHours ?? 0).toFixed(2)} h</td>
                <td>{(vacationAvailable[e.id] ?? 0).toFixed(2)} Tage</td>
              </tr>
            ))}
            {employees.length === 0 && (
              <tr><td colSpan={5}>Keine Mitarbeiter.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Stempelungen heute</h2>
        <div className="admin-table-wrap">
          <table>
            <thead>
              <tr><th>Mitarbeiter</th><th>Login</th><th>Typ</th><th>Zeit</th><th>Quelle</th><th>Notiz</th></tr>
            </thead>
            <tbody>
              {todayOverview.map((e) => (
                <tr
                  key={e.id}
                  style={{
                    background:
                      e.source === "WEB"
                        ? "color-mix(in srgb, var(--web-entry) 25%, white)"
                        : e.source === "BULK_ENTRY"
                          ? "color-mix(in srgb, var(--bulk-entry) 25%, white)"
                          : e.source === "MANUAL_CORRECTION"
                            ? "color-mix(in srgb, var(--manual) 16%, white)"
                            : "transparent"
                  }}
                >
                  <td>{e.userName}</td>
                  <td>{e.loginName}</td>
                  <td>{e.type === "CLOCK_IN" ? "Kommen" : "Gehen"}</td>
                  <td>{formatBerlinTime(e.occurredAt)}</td>
                  <td>{sourceLabel(e.source)}</td>
                  <td>{e.reasonText || "-"}</td>
                </tr>
              ))}
              {todayOverview.length === 0 && <tr><td colSpan={6}>Heute keine Stempelungen.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Antraege</h2>
        <div className="grid">
          {pending.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12, borderColor: "var(--warning)", background: "rgba(245,158,11,0.08)" }}>
              <div><strong>{p.user.name}</strong></div>
              <div><strong>Ereignis:</strong> {kindLabel(p.kind)}</div>
              <div><strong>Zeitraum:</strong> {p.startDate.slice(0, 10)} bis {p.endDate.slice(0, 10)}</div>
              <div><strong>Eingang:</strong> {new Date(p.requestedAt).toLocaleString("de-DE")}</div>
              <div>{p.note || "-"}</div>
              <div>Vorhandener Urlaub: {p.availableVacationDays.toFixed(2)} Tage</div>
              <div>Genommene Urlaubstage (Antrag): {p.requestedWorkingDays.toFixed(2)} Tage</div>
              <div>Verbleibender Urlaub nach Antrag: {p.remainingVacationAfterRequest.toFixed(2)} Tage</div>
              <div>Verfuegbare Ueberstunden (Monat): {p.availableOvertimeHours.toFixed(2)} h</div>

              <div className="card" style={{ marginTop: 10, padding: 10 }}>
                <label>
                  Entscheidungsnotiz (Pflicht)
                  <textarea value={notes[p.id] || ""} onChange={(e) => setNotes({ ...notes, [p.id]: e.target.value })} />
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button onClick={async () => {
                    try {
                      const note = (notes[p.id] || "").trim();
                      if (!note) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                      await api.decideLeave({ leaveId: p.id, decision: "APPROVED", decisionNote: note });
                      await loadData();
                    } catch (e) { setMsg((e as Error).message); }
                  }}>Genehmigen</button>
                  <button className="secondary" onClick={async () => {
                    try {
                      const note = (notes[p.id] || "").trim();
                      if (!note) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                      await api.decideLeave({ leaveId: p.id, decision: "REJECTED", decisionNote: note });
                      await loadData();
                    } catch (e) { setMsg((e as Error).message); }
                  }}>Ablehnen</button>
                </div>
              </div>

              <div className="card" style={{ marginTop: 10, padding: 10 }}>
                <strong>Antrag aendern</strong>
                <div className="grid grid-2" style={{ marginTop: 8 }}>
                  <select value={editKind[p.id] || (p.kind as "VACATION" | "OVERTIME")} onChange={(e) => setEditKind({ ...editKind, [p.id]: e.target.value as "VACATION" | "OVERTIME" })}>
                    <option value="VACATION">Urlaub</option>
                    <option value="OVERTIME">Ueberstunden</option>
                  </select>
                  <input type="date" value={editFrom[p.id] || p.startDate.slice(0, 10)} onChange={(e) => setEditFrom({ ...editFrom, [p.id]: e.target.value })} />
                  <input type="date" value={editTo[p.id] || p.endDate.slice(0, 10)} onChange={(e) => setEditTo({ ...editTo, [p.id]: e.target.value })} />
                </div>
                <textarea style={{ marginTop: 8 }} placeholder="Antragsnotiz (Pflicht)" value={(editNotes[`note-${p.id}`] || p.note || "")} onChange={(e) => setEditNotes({ ...editNotes, [`note-${p.id}`]: e.target.value })} />
                <textarea style={{ marginTop: 8 }} placeholder="Aenderungsnotiz Vorgesetzter (Pflicht)" value={editNotes[p.id] || ""} onChange={(e) => setEditNotes({ ...editNotes, [p.id]: e.target.value })} />
                <button style={{ marginTop: 8 }} onClick={async () => {
                  try {
                    const note = (editNotes[`note-${p.id}`] || p.note || "").trim();
                    const changeNote = (editNotes[p.id] || "").trim();
                    if (!note || !changeNote) { setMsg("Antragsnotiz und Aenderungsnotiz sind Pflicht."); return; }
                    await api.supervisorUpdateLeave({ leaveId: p.id, kind: editKind[p.id] || (p.kind as "VACATION" | "OVERTIME"), startDate: editFrom[p.id] || p.startDate.slice(0, 10), endDate: editTo[p.id] || p.endDate.slice(0, 10), note, changeNote });
                    setMsg("Antrag geaendert.");
                    await loadData();
                  } catch (e) { setMsg((e as Error).message); }
                }}>Aenderung speichern</button>
              </div>
            </div>
          ))}
          {specialPending.map((p) => (
            <div key={p.id} className="card" style={{ padding: 10, borderColor: "var(--holiday)", background: "rgba(249,115,22,0.10)" }}>
              <div><strong>{p.user.name}</strong> ({p.user.loginName})</div>
              <div>Datum: {p.date}</div>
              <div><strong>Ereignis:</strong> {p.eventType || "Arbeit Feiertag/Wochenende"}</div>
              <div><strong>Eingang:</strong> {new Date(p.createdAt).toLocaleString("de-DE")}</div>
              <div><strong>Kommen:</strong> {(p.clockInTimes || []).join(", ") || "-"}</div>
              <div><strong>Gehen:</strong> {(p.clockOutTimes || []).join(", ") || "-"}</div>
              <div><strong>Gesamtstunden:</strong> {(p.workedHours ?? 0).toFixed(2)} h</div>
              <div>Notiz Mitarbeiter: {p.note || "-"}</div>
              <textarea
                style={{ marginTop: 6 }}
                placeholder="Entscheidungsnotiz (Pflicht)"
                value={specialNotes[p.id] || ""}
                onChange={(e) => setSpecialNotes({ ...specialNotes, [p.id]: e.target.value })}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  try {
                    const n = (specialNotes[p.id] || "").trim();
                    if (!n) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                    await api.decideSpecialWork({ approvalId: p.id, decision: "APPROVED", note: n });
                    await loadData();
                  } catch (e) { setMsg((e as Error).message); }
                }}>Genehmigen</button>
                <button className="secondary" onClick={async () => {
                  try {
                    const n = (specialNotes[p.id] || "").trim();
                    if (!n) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                    await api.decideSpecialWork({ approvalId: p.id, decision: "REJECTED", note: n });
                    await loadData();
                  } catch (e) { setMsg((e as Error).message); }
                }}>Ablehnen</button>
              </div>
            </div>
          ))}
          {breakPending.map((p) => (
            <div key={p.id} className="card" style={{ padding: 10, borderColor: "var(--break-credit)", background: "color-mix(in srgb, var(--break-credit) 20%, white)" }}>
              <div><strong>{p.user.name}</strong> ({p.user.loginName})</div>
              <div><strong>Ereignis:</strong> Pausengutschrift</div>
              <div><strong>Datum:</strong> {p.date}</div>
              <div><strong>Minuten:</strong> {p.minutes}</div>
              <div><strong>Eingang:</strong> {new Date(p.requestedAt).toLocaleString("de-DE")}</div>
              <div><strong>Notiz Mitarbeiter:</strong> {p.reason || "-"}</div>
              <textarea
                style={{ marginTop: 6 }}
                placeholder="Entscheidungsnotiz (Pflicht)"
                value={breakNotes[p.id] || ""}
                onChange={(e) => setBreakNotes({ ...breakNotes, [p.id]: e.target.value })}
              />
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  try {
                    const n = (breakNotes[p.id] || "").trim();
                    if (!n) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                    await api.decideBreakCreditRequest({ requestId: p.id, decision: "APPROVED", decisionNote: n });
                    await loadData();
                  } catch (e) { setMsg((e as Error).message); }
                }}>Genehmigen</button>
                <button className="secondary" onClick={async () => {
                  try {
                    const n = (breakNotes[p.id] || "").trim();
                    if (!n) { setMsg("Entscheidungsnotiz ist Pflicht."); return; }
                    await api.decideBreakCreditRequest({ requestId: p.id, decision: "REJECTED", decisionNote: n });
                    await loadData();
                  } catch (e) { setMsg((e as Error).message); }
                }}>Ablehnen</button>
              </div>
            </div>
          ))}
          {pending.length === 0 && specialPending.length === 0 && breakPending.length === 0 && <div>Keine offenen Antraege.</div>}
          {msg && <div className="error">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

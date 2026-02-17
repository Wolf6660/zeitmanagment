import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

export function SupervisorHome() {
  const session = getSession();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; loginName?: string; role: string; annualVacationDays: number; carryOverVacationDays: number }>>([]);
  const [overview, setOverview] = useState<Record<string, { istHours: number; overtimeHours: number }>>({});
  const [vacationAvailable, setVacationAvailable] = useState<Record<string, number>>({});
  const [pending, setPending] = useState<Array<{ id: string; kind: string; startDate: string; endDate: string; note?: string; userId: string; availableVacationDays: number; requestedWorkingDays: number; remainingVacationAfterRequest: number; availableOvertimeHours: number; user: { name: string } }>>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editFrom, setEditFrom] = useState<Record<string, string>>({});
  const [editTo, setEditTo] = useState<Record<string, string>>({});
  const [editKind, setEditKind] = useState<Record<string, "VACATION" | "OVERTIME">>({});
  const [msg, setMsg] = useState("");
  const [specialPending, setSpecialPending] = useState<Array<{ id: string; userId: string; date: string; status: "SUBMITTED" | "APPROVED" | "REJECTED"; note?: string; user: { id: string; name: string; loginName: string } }>>([]);
  const [specialNotes, setSpecialNotes] = useState<Record<string, string>>({});
  const [reasonText, setReasonText] = useState("");
  const [todayEntries, setTodayEntries] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string }>>([]);

  async function loadData() {
    if (!session) return;
    const [e, p, ov, sp, t] = await Promise.all([api.employees(), api.pendingLeaves(), api.supervisorOverview(), api.pendingSpecialWork(), api.todayEntries(session.user.id)]);
    setEmployees(e);
    setPending(p);
    setOverview(Object.fromEntries(ov.map((x) => [x.userId, { istHours: x.istHours, overtimeHours: x.overtimeHours }])));
    setSpecialPending(sp);
    setTodayEntries(t);
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

  return (
    <div className="layout-2-1">
      <div className="card">
        <h2>Eigene Stempeluhr</h2>
        <div className="grid">
          <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Grund / Kommentar (Pflicht)" />
          <div className="row">
            <button onClick={async () => {
              try {
                if (!reasonText.trim()) { setMsg("Grund ist Pflicht."); return; }
                await api.clock({ type: "CLOCK_IN", reasonText });
                await loadData();
                setMsg("Kommen gestempelt.");
              } catch (e) { setMsg((e as Error).message); }
            }}>Kommen</button>
            <button className="secondary" onClick={async () => {
              try {
                if (!reasonText.trim()) { setMsg("Grund ist Pflicht."); return; }
                await api.clock({ type: "CLOCK_OUT", reasonText });
                await loadData();
                setMsg("Gehen gestempelt.");
              } catch (e) { setMsg((e as Error).message); }
            }}>Gehen</button>
          </div>
          <div className="card" style={{ padding: 10 }}>
            <strong>Heute erfasst</strong>
            {todayEntries.length === 0 && <div>Keine Ereignisse heute.</div>}
            {todayEntries.map((e) => (
              <div key={e.id}>
                {e.type === "CLOCK_IN" ? "Kommen" : "Gehen"} {new Date(e.occurredAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
                {e.reasonText ? ` - ${e.reasonText}` : ""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Uebersicht Mitarbeiter</h2>
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
                <td>{(overview[e.id]?.overtimeHours ?? 0).toFixed(2)} h</td>
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
        <h2>Antraege</h2>
        <div className="grid">
          {pending.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12, borderColor: "var(--warning)", background: "rgba(245,158,11,0.08)" }}>
              <div><strong>{p.user.name}</strong></div>
              <div>{kindLabel(p.kind)}: {p.startDate.slice(0, 10)} bis {p.endDate.slice(0, 10)}</div>
              <div>{p.note || "-"}</div>
              <div>Verfuegbarer Urlaub: {p.availableVacationDays.toFixed(2)} Tage</div>
              <div>Antragstage (Arbeitstage): {p.requestedWorkingDays.toFixed(2)} Tage</div>
              <div>Verbleibend nach Antrag: {p.remainingVacationAfterRequest.toFixed(2)} Tage</div>
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
              <div><strong>Typ:</strong> Arbeit Feiertag/Wochenende</div>
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
          {pending.length === 0 && specialPending.length === 0 && <div>Keine offenen Antraege.</div>}
          {msg && <div className="error">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

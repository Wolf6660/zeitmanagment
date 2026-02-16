import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

export function SupervisorHome() {
  const now = new Date();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; loginName?: string; role: string; annualVacationDays: number; carryOverVacationDays: number }>>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: string; startDate: string; endDate: string; note?: string; userId: string; availableVacationDays: number; availableOvertimeHours: number; user: { name: string } }>>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [editFrom, setEditFrom] = useState<Record<string, string>>({});
  const [editTo, setEditTo] = useState<Record<string, string>>({});
  const [editKind, setEditKind] = useState<Record<string, "VACATION" | "OVERTIME">>({});
  const [msg, setMsg] = useState("");

  const [monthUserId, setMonthUserId] = useState("");
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [monthView, setMonthView] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideIn, setOverrideIn] = useState("");
  const [overrideOut, setOverrideOut] = useState("");

  async function loadData() {
    const [e, p] = await Promise.all([api.employees(), api.pendingLeaves()]);
    setEmployees(e);
    setPending(p);
    setMonthUserId((prev) => prev || e[0]?.id || "");
  }

  async function loadMonth() {
    if (!monthUserId) return;
    const mv = await api.monthView(monthUserId, monthYear, monthNum);
    setMonthView(mv);
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    loadMonth().catch((e) => setMsg((e as Error).message));
  }, [monthUserId, monthYear, monthNum]);

  return (
    <div className="grid">
      <div className="grid grid-2">
        <div className="card">
          <h2>Stundenaufzeichnung Mitarbeiter</h2>
          <table>
            <thead>
              <tr><th>Name</th><th>Rolle</th><th>Jahresurlaub</th><th>Resturlaub Vorjahr</th></tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}><td>{e.name}</td><td>{e.role}</td><td>{e.annualVacationDays}</td><td>{e.carryOverVacationDays}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Antraege offen</h2>
          <div className="grid">
            {pending.map((p) => (
              <div key={p.id} className="card" style={{ padding: 12 }}>
                <div><strong>{p.user.name}</strong></div>
                <div>{kindLabel(p.kind)}: {p.startDate.slice(0, 10)} bis {p.endDate.slice(0, 10)}</div>
                <div>{p.note || "-"}</div>
                <div>Verfuegbarer Urlaub: {p.availableVacationDays.toFixed(2)} Tage</div>
                <div>Verfuegbare Ueberstunden (Monat): {p.availableOvertimeHours.toFixed(2)} h</div>
                <label style={{ marginTop: 8 }}>Entscheidungsnotiz (Pflicht)
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
            {pending.length === 0 && <div>Keine offenen Antraege.</div>}
            {msg && <div className="error">{msg}</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Monatsuebersicht bearbeiten</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <select value={monthUserId} onChange={(e) => setMonthUserId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <input type="number" value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))} style={{ maxWidth: 120 }} />
          <input type="number" min={1} max={12} value={monthNum} onChange={(e) => setMonthNum(Number(e.target.value))} style={{ maxWidth: 90 }} />
          <button className="secondary" onClick={() => loadMonth()}>Laden</button>
        </div>
        {monthView && (
          <table>
            <thead><tr><th>Datum</th><th>Soll</th><th>Ist</th><th>Buchungen</th><th>Aktion</th></tr></thead>
            <tbody>
              {monthView.days.map((d: any) => (
                <tr key={d.date} style={{ background: d.isHoliday || d.isWeekend ? "rgba(249,115,22,0.08)" : "transparent" }}>
                  <td>{d.date}</td>
                  <td>{d.plannedHours.toFixed(2)}</td>
                  <td>{d.workedHours.toFixed(2)}</td>
                  <td>{d.entries.map((e: any) => `${e.type === "CLOCK_IN" ? "K" : "G"} ${e.time}`).join(" | ")}</td>
                  <td><button className="secondary" onClick={() => {
                    setSelectedDay(d);
                    const inEntry = d.entries.find((e: any) => e.type === "CLOCK_IN");
                    const outEntry = d.entries.find((e: any) => e.type === "CLOCK_OUT");
                    setOverrideIn(inEntry?.time || "");
                    setOverrideOut(outEntry?.time || "");
                    setOverrideNote("");
                  }}>Bearbeiten</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {selectedDay && (
          <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <strong>Tag bearbeiten: {selectedDay.date}</strong>
            <div className="grid grid-2" style={{ marginTop: 8 }}>
              <label>Kommen<input type="time" value={overrideIn} onChange={(e) => setOverrideIn(e.target.value)} /></label>
              <label>Gehen<input type="time" value={overrideOut} onChange={(e) => setOverrideOut(e.target.value)} /></label>
            </div>
            <textarea style={{ marginTop: 8 }} placeholder="Notiz (Pflichtfeld)" value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={async () => {
                try {
                  if (!overrideNote.trim()) { setMsg("Notiz ist Pflicht."); return; }
                  const events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> = [];
                  if (overrideIn) events.push({ type: "CLOCK_IN", time: overrideIn });
                  if (overrideOut) events.push({ type: "CLOCK_OUT", time: overrideOut });
                  if (events.length === 0) { setMsg("Mindestens ein Ereignis erforderlich."); return; }
                  await api.dayOverrideBySupervisor({ userId: monthUserId, date: selectedDay.date, note: overrideNote.trim(), events });
                  setMsg("Tag aktualisiert.");
                  setSelectedDay(null);
                  await loadMonth();
                } catch (e) { setMsg((e as Error).message); }
              }}>Tag speichern</button>
              <button className="secondary" onClick={() => setSelectedDay(null)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

export function MonthEditorPage() {
  const now = new Date();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [monthUserId, setMonthUserId] = useState("");
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [monthView, setMonthView] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideIn, setOverrideIn] = useState("");
  const [overrideOut, setOverrideOut] = useState("");
  const [msg, setMsg] = useState("");

  async function loadEmployees() {
    const e = await api.employees();
    setEmployees(e);
    setMonthUserId((prev) => prev || e[0]?.id || "");
  }

  async function loadMonth() {
    if (!monthUserId) return;
    const mv = await api.monthView(monthUserId, monthYear, monthNum);
    setMonthView(mv);
  }

  useEffect(() => {
    loadEmployees().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    loadMonth().catch((e) => setMsg((e as Error).message));
  }, [monthUserId, monthYear, monthNum]);

  return (
    <div className="card">
      <h2>Monatsansicht</h2>
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
            {monthView.days.map((d: any) => {
              const expanded = selectedDay === d.date;
              return (
                <React.Fragment key={d.date}>
                  <tr style={{ background: d.isHoliday || d.isWeekend ? "rgba(249,115,22,0.08)" : "transparent" }}>
                    <td>{d.date}</td>
                    <td>{d.plannedHours.toFixed(2)}</td>
                    <td>{d.workedHours.toFixed(2)}</td>
                    <td>{d.entries.map((e: any) => `${e.type === "CLOCK_IN" ? "K" : "G"} ${e.time}`).join(" | ")}</td>
                    <td>
                      <button className="secondary" onClick={() => {
                        setSelectedDay(expanded ? null : d.date);
                        const inEntry = d.entries.find((e: any) => e.type === "CLOCK_IN");
                        const outEntry = d.entries.find((e: any) => e.type === "CLOCK_OUT");
                        setOverrideIn(inEntry?.time || "");
                        setOverrideOut(outEntry?.time || "");
                        setOverrideNote("");
                      }}>Bearbeiten</button>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={5}>
                        <div className="card" style={{ padding: 10 }}>
                          <strong>Tag bearbeiten: {d.date}</strong>
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
                                await api.dayOverrideBySupervisor({ userId: monthUserId, date: d.date, note: overrideNote.trim(), events });
                                setMsg("Tag aktualisiert.");
                                await loadMonth();
                              } catch (e) { setMsg((e as Error).message); }
                            }}>Tag speichern</button>
                            <button className="secondary" onClick={() => setSelectedDay(null)}>Abbrechen</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      )}

      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

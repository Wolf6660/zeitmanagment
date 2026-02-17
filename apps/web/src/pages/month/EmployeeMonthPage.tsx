import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";

export function EmployeeMonthPage() {
  const session = getSession();
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [monthView, setMonthView] = useState<{
    monthPlanned: number;
    monthWorked: number;
    days: Array<{ date: string; plannedHours: number; workedHours: number; isHoliday: boolean; isWeekend: boolean; entries: Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; time: string; source?: string; reasonText?: string }> }>;
  } | null>(null);
  const [msg, setMsg] = useState("");

  async function load() {
    if (!session) return;
    const mv = await api.monthView(session.user.id, monthYear, monthNum);
    setMonthView(mv);
  }

  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message));
  }, [monthYear, monthNum]);

  if (!session) return null;

  return (
    <div className="card">
      <h2>Monatsansicht</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <input type="number" value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))} style={{ maxWidth: 120 }} />
        <input type="number" min={1} max={12} value={monthNum} onChange={(e) => setMonthNum(Number(e.target.value))} style={{ maxWidth: 90 }} />
        <button className="secondary" onClick={() => load()}>Laden</button>
        {monthView && (
          <>
            <span>Monat Soll: <strong>{monthView.monthPlanned.toFixed(2)} h</strong></span>
            <span>Monat Ist: <strong>{monthView.monthWorked.toFixed(2)} h</strong></span>
          </>
        )}
      </div>
      {monthView && (
        <table>
          <thead><tr><th>Datum</th><th>Soll</th><th>Ist</th><th>Buchungen</th></tr></thead>
          <tbody>
            {monthView.days.map((d) => (
              <tr key={d.date} style={{ background: d.isHoliday || d.isWeekend ? "color-mix(in srgb, var(--holiday) 18%, white)" : "transparent" }}>
                <td>{d.date}</td>
                <td>{d.plannedHours.toFixed(2)}</td>
                <td>{d.workedHours.toFixed(2)}</td>
                <td>
                  {d.entries.map((e) => (
                    <span
                      key={e.id}
                      style={{
                        marginRight: 8,
                        color: e.source === "MANUAL_CORRECTION" ? "var(--manual)" : e.source === "WEB" ? "var(--web-entry)" : "inherit"
                      }}
                    >
                      {e.type === "CLOCK_IN" ? "K" : "G"} {e.time}
                      {e.reasonText ? ` (${e.reasonText})` : ""}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

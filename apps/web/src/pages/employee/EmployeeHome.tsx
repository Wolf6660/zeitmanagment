import React, { useEffect, useMemo, useState } from "react";
import { api, getSession } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

type LeaveFilter = "APPROVED" | "REJECTED";

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

function pad(v: number): string {
  return String(v).padStart(2, "0");
}

export function EmployeeHome() {
  const session = getSession();
  const today = new Date();
  const [summary, setSummary] = useState<{ plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean; manualAdjustmentHours?: number } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [message, setMessage] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveList, setLeaveList] = useState<Array<{ id: string; kind: string; status: string; startDate: string; endDate: string; note?: string }>>([]);
  const [todayEntries, setTodayEntries] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string }>>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [manualIn, setManualIn] = useState("");
  const [manualOut, setManualOut] = useState("");

  const [leaveKind, setLeaveKind] = useState<"VACATION" | "OVERTIME">("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveNote, setLeaveNote] = useState("");
  const [filter, setFilter] = useState<LeaveFilter>("APPROVED");

  const [monthYear, setMonthYear] = useState(today.getFullYear());
  const [monthNum, setMonthNum] = useState(today.getMonth() + 1);
  const [monthView, setMonthView] = useState<{
    monthPlanned: number;
    monthWorked: number;
    days: Array<{ date: string; plannedHours: number; workedHours: number; isHoliday: boolean; isWeekend: boolean; hasManualCorrection: boolean; entries: Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> }>;
  } | null>(null);

  async function reloadData() {
    if (!session) return;
    const [s, leaves, events, mv] = await Promise.all([
      api.summary(session.user.id),
      api.myLeaves(),
      api.todayEntries(session.user.id),
      api.monthView(session.user.id, monthYear, monthNum)
    ]);
    setSummary(s);
    setLeaveList(leaves);
    setTodayEntries(events);
    setMonthView(mv);
  }

  useEffect(() => {
    reloadData().catch((e) => setMessage((e as Error).message));
  }, [monthYear, monthNum]);

  const filteredLeaves = useMemo(() => leaveList.filter((l) => l.status === filter), [leaveList, filter]);
  const openClockIn = todayEntries.length > 0 && todayEntries[todayEntries.length - 1].type === "CLOCK_IN";

  if (!session) return null;

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Stempeluhr</h2>
        <p>Grund ist Pflichtfeld.</p>
        <div className="grid">
          <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Grund / Kommentar (Pflicht)" />
          <div className="row">
            <button
              onClick={async () => {
                try {
                  if (!reasonText.trim()) {
                    setMessage("Grund ist Pflicht.");
                    return;
                  }
                  await api.clock({ type: "CLOCK_IN", reasonText });
                  setMessage("Kommen gestempelt.");
                  await reloadData();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Kommen
            </button>
            <button
              className="secondary"
              onClick={async () => {
                try {
                  if (!reasonText.trim()) {
                    setMessage("Grund ist Pflicht.");
                    return;
                  }
                  await api.clock({ type: "CLOCK_OUT", reasonText });
                  setMessage("Gehen gestempelt.");
                  await reloadData();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Gehen
            </button>
          </div>
          <button className="secondary" onClick={() => setManualMode((m) => !m)}>
            {manualMode ? "Bearbeiten schliessen" : "Tag bearbeiten (heute)"}
          </button>
          {manualMode && (
            <div className="card" style={{ padding: 10 }}>
              <strong>Heutige Zeiten bearbeiten</strong>
              <div className="grid" style={{ marginTop: 8 }}>
                <label>
                  Kommen
                  <input type="time" value={manualIn} onChange={(e) => setManualIn(e.target.value)} />
                </label>
                <label>
                  Gehen
                  <input type="time" value={manualOut} onChange={(e) => setManualOut(e.target.value)} />
                </label>
                <textarea placeholder="Notiz (Pflichtfeld)" value={manualNote} onChange={(e) => setManualNote(e.target.value)} />
                <button
                  onClick={async () => {
                    try {
                      if (!manualNote.trim()) {
                        setMessage("Notiz ist Pflicht.");
                        return;
                      }
                      const events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> = [];
                      if (manualIn) events.push({ type: "CLOCK_IN", time: manualIn });
                      if (manualOut) events.push({ type: "CLOCK_OUT", time: manualOut });
                      if (events.length === 0) {
                        setMessage("Mindestens eine Zeit ist erforderlich.");
                        return;
                      }
                      const nowDate = new Date();
                      const date = `${nowDate.getFullYear()}-${pad(nowDate.getMonth() + 1)}-${pad(nowDate.getDate())}`;
                      await api.dayOverrideSelf({ date, note: manualNote.trim(), events });
                      setMessage("Heutige Zeiten aktualisiert.");
                      await reloadData();
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Heutigen Tag speichern
                </button>
              </div>
            </div>
          )}
          {message && <div className="success">{message}</div>}

          <div className="card" style={{ padding: 10 }}>
            <strong>Heute erfasst</strong>
            {todayEntries.length === 0 && <div>Keine Ereignisse heute.</div>}
            {todayEntries.map((e) => (
              <div key={e.id} style={{ color: e.source === "MANUAL_CORRECTION" ? "var(--manual)" : "inherit" }}>
                {e.type === "CLOCK_IN" ? "Kommen" : "Gehen"} {new Date(e.occurredAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
              </div>
            ))}
            {openClockIn && <div className="error">Offene Buchung: Ausstempeln fehlt noch.</div>}
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Monatsuebersicht Stunden</h2>
        {summary && (
          <div className="grid">
            <div>Sollstunden: <strong>{summary.plannedHours.toFixed(2)}</strong></div>
            <div>Geleistete Stunden: <strong>{summary.workedHours.toFixed(2)}</strong></div>
            <div>Ueberstunden: <strong>{summary.overtimeHours.toFixed(2)}</strong></div>
            {summary.longShiftAlert && <StatusBadge text=">12h erkannt" color="var(--warning)" />}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Urlaubsantrag / Ueberstundenabbau</h2>
        <div className="grid">
          <select value={leaveKind} onChange={(e) => setLeaveKind(e.target.value as "VACATION" | "OVERTIME")}>
            <option value="VACATION">Urlaub</option>
            <option value="OVERTIME">Ueberstunden</option>
          </select>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <textarea value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="Notiz (Pflichtfeld)" />
          <button
            onClick={async () => {
              try {
                if (!leaveNote.trim()) {
                  setLeaveMessage("Notiz ist Pflicht.");
                  return;
                }
                const created = await api.createLeave({ kind: leaveKind, startDate, endDate, note: leaveNote.trim() });
                setLeaveMessage(
                  created.warningOverdrawn
                    ? `Warnung: Urlaub reicht nicht aus. Verfuegbar: ${created.availableVacationDays.toFixed(2)} Tage.`
                    : "Antrag gestellt."
                );
                await reloadData();
              } catch (e) {
                setLeaveMessage((e as Error).message);
              }
            }}
          >
            Antrag senden
          </button>
          {leaveMessage && <div className={leaveMessage.startsWith("Warnung") || leaveMessage.includes("Pflicht") ? "error" : "success"}>{leaveMessage}</div>}
        </div>
      </div>

      <div className="card">
        <h2>Meine Antraege</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className={filter === "APPROVED" ? "" : "secondary"} onClick={() => setFilter("APPROVED")}>Genehmigt</button>
          <button className={filter === "REJECTED" ? "" : "secondary"} onClick={() => setFilter("REJECTED")}>Abgelehnt</button>
        </div>
        <table>
          <thead>
            <tr><th>Status</th><th>Typ</th><th>Von</th><th>Bis</th><th>Notiz</th></tr>
          </thead>
          <tbody>
            {filteredLeaves.map((l) => (
              <tr key={l.id}>
                <td>{l.status === "APPROVED" ? <StatusBadge text="Genehmigt" color="var(--approved)" /> : <StatusBadge text="Abgelehnt" color="var(--rejected)" />}</td>
                <td>{kindLabel(l.kind)}</td>
                <td>{l.startDate.slice(0, 10)}</td>
                <td>{l.endDate.slice(0, 10)}</td>
                <td>{l.note || "-"}</td>
              </tr>
            ))}
            {filteredLeaves.length === 0 && <tr><td colSpan={5}>Keine Eintraege.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ gridColumn: "1 / -1" }}>
        <h2>Monatsansicht</h2>
        <div className="row" style={{ marginBottom: 8 }}>
          <input type="number" value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))} style={{ maxWidth: 120 }} />
          <input type="number" min={1} max={12} value={monthNum} onChange={(e) => setMonthNum(Number(e.target.value))} style={{ maxWidth: 90 }} />
          <button className="secondary" onClick={() => reloadData()}>Laden</button>
          {monthView && (
            <>
              <span>Monat Soll: <strong>{monthView.monthPlanned.toFixed(2)} h</strong></span>
              <span>Monat Ist: <strong>{monthView.monthWorked.toFixed(2)} h</strong></span>
            </>
          )}
        </div>
        {monthView && (
          <table>
            <thead>
              <tr><th>Datum</th><th>Soll</th><th>Ist</th><th>Buchungen</th></tr>
            </thead>
            <tbody>
              {monthView.days.map((d) => (
                <tr key={d.date} style={{ background: d.isHoliday || d.isWeekend ? "rgba(249,115,22,0.08)" : "transparent" }}>
                  <td>{d.date}</td>
                  <td>{d.plannedHours.toFixed(2)}</td>
                  <td>{d.workedHours.toFixed(2)}</td>
                  <td>
                    {d.entries.map((e) => (
                      <span key={e.id} style={{ marginRight: 8, color: e.source === "MANUAL_CORRECTION" ? "var(--manual)" : "inherit" }}>
                        {e.type === "CLOCK_IN" ? "K" : "G"} {e.time}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

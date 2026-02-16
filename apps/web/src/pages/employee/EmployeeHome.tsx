import React, { useEffect, useMemo, useState } from "react";
import { api, getSession } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

type LeaveFilter = "APPROVED" | "REJECTED";

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

export function EmployeeHome() {
  const session = getSession();
  const [summary, setSummary] = useState<{ plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [message, setMessage] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveList, setLeaveList] = useState<Array<{ id: string; kind: string; status: string; startDate: string; endDate: string; note?: string }>>([]);
  const [todayEntries, setTodayEntries] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string }>>([]);

  const [leaveKind, setLeaveKind] = useState<"VACATION" | "OVERTIME">("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveNote, setLeaveNote] = useState("");
  const [filter, setFilter] = useState<LeaveFilter>("APPROVED");

  async function reloadData() {
    if (!session) return;
    const [s, leaves, events] = await Promise.all([api.summary(session.user.id), api.myLeaves(), api.todayEntries(session.user.id)]);
    setSummary(s);
    setLeaveList(leaves);
    setTodayEntries(events);
  }

  useEffect(() => {
    reloadData().catch((e) => setMessage((e as Error).message));
  }, []);

  const filteredLeaves = useMemo(() => leaveList.filter((l) => l.status === filter), [leaveList, filter]);
  const openClockIn = todayEntries.length > 0 && todayEntries[todayEntries.length - 1].type === "CLOCK_IN";

  if (!session) return null;

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Stempeluhr</h2>
        <p>Grund fuer Web-Einstempelung optional als Freitext.</p>
        <div className="grid">
          <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Grund / Kommentar" />
          <div className="row">
            <button
              onClick={async () => {
                try {
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
          {message && <div className="success">{message}</div>}

          <div className="card" style={{ padding: 10 }}>
            <strong>Heute erfasst</strong>
            {todayEntries.length === 0 && <div>Keine Ereignisse heute.</div>}
            {todayEntries.map((e) => (
              <div key={e.id}>
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
            <div>
              Sollstunden: <strong>{summary.plannedHours.toFixed(2)}</strong>
            </div>
            <div>
              Geleistete Stunden: <strong>{summary.workedHours.toFixed(2)}</strong>
            </div>
            <div>
              Ueberstunden: <strong>{summary.overtimeHours.toFixed(2)}</strong>
            </div>
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
            <tr>
              <th>Status</th>
              <th>Typ</th>
              <th>Von</th>
              <th>Bis</th>
              <th>Notiz</th>
            </tr>
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
            {filteredLeaves.length === 0 && (
              <tr>
                <td colSpan={5}>Keine Eintraege.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

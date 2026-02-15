import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

export function EmployeeHome() {
  const session = getSession();
  const [summary, setSummary] = useState<{ plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [message, setMessage] = useState("");
  const [leaveMessage, setLeaveMessage] = useState("");
  const [leaveList, setLeaveList] = useState<Array<{ id: string; kind: string; status: string; startDate: string; endDate: string; note?: string }>>([]);

  const [leaveKind, setLeaveKind] = useState<"VACATION" | "OVERTIME">("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [leaveNote, setLeaveNote] = useState("");

  useEffect(() => {
    const load = async () => {
      if (!session) return;
      const [s, leaves] = await Promise.all([api.summary(session.user.id), api.myLeaves()]);
      setSummary(s);
      setLeaveList(leaves);
    };
    load().catch((e) => setMessage((e as Error).message));
  }, [session]);

  if (!session) return null;

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Stempeluhr</h2>
        <p>Grund fuer Web-Einstempelung optional als Freitext.</p>
        <div className="grid">
          <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Grund / Kommentar" />
          <div className="row">
            <button onClick={async () => {
              await api.clock({ type: "CLOCK_IN", reasonText });
              setMessage("Kommen gestempelt.");
            }}>Kommen</button>
            <button className="secondary" onClick={async () => {
              await api.clock({ type: "CLOCK_OUT", reasonText });
              setMessage("Gehen gestempelt.");
            }}>Gehen</button>
          </div>
          {message && <div className="success">{message}</div>}
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
          <textarea value={leaveNote} onChange={(e) => setLeaveNote(e.target.value)} placeholder="Notiz" />
          <button
            onClick={async () => {
              const created = await api.createLeave({ kind: leaveKind, startDate, endDate, note: leaveNote });
              setLeaveMessage(created.warningOverdrawn ? "Warnung: Urlaub reicht nicht aus (farblich markieren)." : "Antrag gestellt.");
              setLeaveList(await api.myLeaves());
            }}
          >
            Antrag senden
          </button>
          {leaveMessage && <div className={leaveMessage.startsWith("Warnung") ? "error" : "success"}>{leaveMessage}</div>}
        </div>
      </div>

      <div className="card">
        <h2>Meine Antraege</h2>
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
            {leaveList.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.status === "APPROVED" && <StatusBadge text="Genehmigt" color="var(--approved)" />}
                  {l.status === "REJECTED" && <StatusBadge text="Abgelehnt" color="var(--rejected)" />}
                  {l.status === "SUBMITTED" && <StatusBadge text="Offen" color="#0f172a" />}
                  {l.status === "CANCELED" && <StatusBadge text="Storniert" color="#6b7280" />}
                </td>
                <td>{l.kind}</td>
                <td>{l.startDate.slice(0, 10)}</td>
                <td>{l.endDate.slice(0, 10)}</td>
                <td>{l.note || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

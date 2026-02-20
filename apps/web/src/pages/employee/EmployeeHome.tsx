import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

function formatBerlinTime(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date(iso));
}

export function EmployeeHome() {
  const session = getSession();
  const [summary, setSummary] = useState<{ plannedHours: number; workedHours: number; overtimeHours: number; longShiftAlert: boolean; manualAdjustmentHours?: number } | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [message, setMessage] = useState("");
  const [todayEntries, setTodayEntries] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; occurredAt: string; source: string; reasonText?: string }>>([]);
  const [manualMode, setManualMode] = useState(false);
  const [manualNote, setManualNote] = useState("");
  const [manualIn, setManualIn] = useState("");
  const [manualOut, setManualOut] = useState("");
  const [manualDate, setManualDate] = useState("");
  const [maxBackDays, setMaxBackDays] = useState(3);
  const [schoolDate, setSchoolDate] = useState(new Date().toISOString().slice(0, 10));
  const isAzubi = session?.user.role === "AZUBI";

  async function reloadData() {
    if (!session) return;
    const [s, events] = await Promise.all([
      api.summary(session.user.id),
      api.todayEntries(session.user.id)
    ]);
    setSummary(s);
    setTodayEntries(events);
  }

  useEffect(() => {
    reloadData().catch((e) => setMessage((e as Error).message));
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
            {manualMode ? "Nachtragen schliessen" : "Nachtragen"}
          </button>
          {isAzubi && (
            <div className="card" style={{ padding: 10 }}>
              <strong>Berufsschule</strong>
              <div style={{ color: "var(--muted)" }}>8 Stunden mit Notiz "Berufsschule", bis 3 Tage rueckwirkend.</div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  type="date"
                  value={schoolDate}
                  onChange={(e) => setSchoolDate(e.target.value)}
                  max={new Date().toISOString().slice(0, 10)}
                  min={new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10)}
                />
                <button
                  className="secondary"
                  onClick={async () => {
                    try {
                      if (!schoolDate) {
                        setMessage("Datum ist Pflicht.");
                        return;
                      }
                      const ok = window.confirm(`Berufsschule fuer ${schoolDate} eintragen (8 Stunden)?`);
                      if (!ok) return;
                      await api.azubiSchoolDay({ date: schoolDate });
                      setMessage("Berufsschule eingetragen.");
                      await reloadData();
                    } catch (e) {
                      setMessage((e as Error).message);
                    }
                  }}
                >
                  Berufsschule
                </button>
              </div>
            </div>
          )}
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
                  onClick={async () => {
                    try {
                      if (!manualNote.trim()) {
                        setMessage("Notiz ist Pflicht.");
                        return;
                      }
                      if (!manualDate) {
                        setMessage("Datum ist Pflicht.");
                        return;
                      }
                      const events: Array<{ type: "CLOCK_IN" | "CLOCK_OUT"; time: string }> = [];
                      if (manualIn) events.push({ type: "CLOCK_IN", time: manualIn.slice(0, 5) });
                      if (manualOut) events.push({ type: "CLOCK_OUT", time: manualOut.slice(0, 5) });
                      if (events.length === 0) {
                        setMessage("Mindestens eine Zeit ist erforderlich.");
                        return;
                      }
                      await api.dayOverrideSelf({ date: manualDate, note: manualNote.trim(), events });
                      setMessage("Nachtrag gespeichert.");
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
              <div
                key={e.id}
                style={{
                  color: e.source === "MANUAL_CORRECTION" ? "var(--manual)" : e.source === "WEB" ? "var(--web-entry)" : "inherit",
                  background: e.source === "WEB" ? "color-mix(in srgb, var(--web-entry) 20%, white)" : "transparent",
                  borderRadius: 8,
                  padding: "4px 6px"
                }}
                >
                {e.type === "CLOCK_IN" ? "Kommen" : "Gehen"} {formatBerlinTime(e.occurredAt)}
                {e.reasonText ? ` - ${e.reasonText}` : ""}
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
            <div>Ueberstunden: <strong style={{ color: "var(--overtime)" }}>{summary.overtimeHours.toFixed(2)}</strong></div>
            {summary.longShiftAlert && <StatusBadge text=">12h erkannt" color="var(--warning)" />}
          </div>
        )}
      </div>

    </div>
  );
}

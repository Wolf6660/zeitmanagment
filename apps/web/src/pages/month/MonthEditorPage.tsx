import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

function dayRowBackground(d: { specialWorkApprovalStatus?: "SUBMITTED" | "APPROVED" | "REJECTED" | null; isSick?: boolean; isHoliday: boolean; isWeekend: boolean; workedHours: number; hasManualCorrection?: boolean }): string {
  if (d.specialWorkApprovalStatus === "REJECTED") return "color-mix(in srgb, var(--rejected) 22%, white)";
  if (d.specialWorkApprovalStatus === "SUBMITTED") return "color-mix(in srgb, var(--warning) 18%, white)";
  if (d.specialWorkApprovalStatus === "APPROVED") return "color-mix(in srgb, var(--approved) 18%, white)";
  if (d.isSick) return "color-mix(in srgb, var(--sick) 18%, white)";
  if (d.isHoliday || d.isWeekend) {
    return d.workedHours > 0
      ? "color-mix(in srgb, var(--holiday) 22%, white)"
      : "color-mix(in srgb, var(--holiday-day) 28%, white)";
  }
  if (d.hasManualCorrection) return "color-mix(in srgb, var(--manual) 14%, white)";
  return "transparent";
}

function entryStyle(source?: string): React.CSSProperties {
  if (source === "WEB") {
    return { marginRight: 8, color: "var(--web-entry)", background: "color-mix(in srgb, var(--web-entry) 20%, white)", borderRadius: 6, padding: "2px 6px" };
  }
  if (source === "MANUAL_CORRECTION" || source === "SUPERVISOR_CORRECTION") {
    return { marginRight: 8, color: "var(--manual)", background: "color-mix(in srgb, var(--manual) 16%, white)", borderRadius: 6, padding: "2px 6px" };
  }
  return { marginRight: 8 };
}

export function MonthEditorPage() {
  const now = new Date();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role?: string }>>([]);
  const [monthUserId, setMonthUserId] = useState("");
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [monthView, setMonthView] = useState<any>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideEvents, setOverrideEvents] = useState<Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; time: string }>>([]);
  const [msg, setMsg] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadEmployees() {
    const e = await api.employees();
    setEmployees(e);
    setMonthUserId((prev) => prev || e[0]?.id || "");
  }

  async function loadMonth() {
    if (!monthUserId) return;
    const mv = await api.monthView(monthUserId, monthYear, monthNum);
    setMonthView(mv);
    return mv;
  }

  useEffect(() => {
    loadEmployees().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    loadMonth().catch((e) => setMsg((e as Error).message));
  }, [monthUserId, monthYear, monthNum]);

  const selectedEmployeeRole = employees.find((e) => e.id === monthUserId)?.role;
  const selectedIsAzubi = selectedEmployeeRole === "AZUBI";

  return (
    <div className="card">
      <h2>Monatsansicht</h2>
      <div className="row" style={{ marginBottom: 8 }}>
        <select value={monthUserId} onChange={(e) => setMonthUserId(e.target.value)}>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <input type="number" value={monthYear} onChange={(e) => setMonthYear(Number(e.target.value))} style={{ maxWidth: 120 }} />
        <input type="number" min={1} max={12} value={monthNum} onChange={(e) => setMonthNum(Number(e.target.value))} style={{ maxWidth: 90 }} />
        <button className="secondary" type="button" onClick={() => loadMonth()}>Laden</button>
        <button
          className="secondary"
          type="button"
          onClick={async () => {
            try {
              if (!monthUserId) { setActionMsg("Bitte Mitarbeiter auswaehlen."); return; }
              const blob = await api.monthReportPdf(monthUserId, monthYear, monthNum);
              const url = URL.createObjectURL(blob);
              const employeeName = employees.find((e) => e.id === monthUserId)?.name || "mitarbeiter";
              const a = document.createElement("a");
              a.href = url;
              a.download = `stundenzettel-${employeeName.replace(/\s+/g, "-").toLowerCase()}-${monthYear}-${String(monthNum).padStart(2, "0")}.pdf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setActionMsg("Stundenzettel wurde heruntergeladen.");
            } catch (e) {
              setActionMsg((e as Error).message);
            }
          }}
        >
          PDF exportieren
        </button>
        <button
          className="secondary"
          type="button"
          onClick={async () => {
            try {
              if (!monthUserId) { setActionMsg("Bitte Mitarbeiter auswaehlen."); return; }
              await api.sendMonthReportMail({ userId: monthUserId, year: monthYear, month: monthNum, recipient: "SELF" });
              setActionMsg("Monatsbericht wurde per E-Mail versendet.");
            } catch (e) {
              setActionMsg((e as Error).message);
            }
          }}
        >
          Per Mail senden
        </button>
      </div>
      {actionMsg && <div className={actionMsg.includes("versendet") || actionMsg.includes("heruntergeladen") ? "success" : "error"} style={{ marginBottom: 10 }}>{actionMsg}</div>}

      {monthView && (
        <table>
          <thead><tr><th>Datum</th><th>Soll</th><th>Ist</th><th>Buchungen</th><th>Notizen</th><th>Aktion</th></tr></thead>
          <tbody>
            {monthView.days.map((d: any) => {
              const expanded = selectedDay === d.date;
              const bg = dayRowBackground(d);
              return (
                <React.Fragment key={d.date}>
                  <tr
                    style={{ background: bg }}
                  >
                    <td>{d.date}</td>
                    <td>{d.plannedHours.toFixed(2)}</td>
                    <td style={{ color: d.workedHours !== d.plannedHours ? "var(--overtime)" : "inherit", fontWeight: d.workedHours !== d.plannedHours ? 600 : 400 }}>{d.workedHours.toFixed(2)}</td>
                    <td>
                      <div>
                        {d.entries.map((e: any) => (
                          <span
                            key={`entry-${d.date}-${e.id || e.time}`}
                            style={entryStyle(e.source)}
                          >
                            {e.type === "CLOCK_IN" ? "K" : "G"} {e.time}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{Array.from(new Set(d.entries.map((e: any) => e.reasonText).filter((x: string | undefined) => Boolean(x && x.trim())))).join(" | ") || "-"}</td>
                    <td>
                      <div className="row">
                        <button className="secondary" type="button" onClick={() => {
                          setSelectedDay(expanded ? null : d.date);
                          setOverrideEvents(
                            (d.entries || []).map((e: any, idx: number) => ({
                              id: e.id || `${d.date}-${idx}`,
                              type: e.type,
                              time: e.time
                            }))
                          );
                          setOverrideNote("");
                          setMsg("");
                        }}>Bearbeiten</button>
                        {d.isSick && (
                          <button
                            className="secondary"
                            type="button"
                            onClick={async () => {
                              try {
                                await api.deleteSickLeaveDay({ userId: monthUserId, date: d.date });
                                setMsg("Krankheitstag entfernt.");
                                await loadMonth();
                              } catch (e) {
                                setMsg((e as Error).message);
                              }
                            }}
                          >
                            Krank-Tag loeschen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expanded && (
                    <tr>
                      <td colSpan={6}>
                        <div className="card" style={{ padding: 10 }}>
                          <strong>Tag bearbeiten: {d.date}</strong>
                          <div className="grid" style={{ marginTop: 8 }}>
                            {overrideEvents.map((evt, idx) => (
                              <div key={evt.id} className="row">
                                <select
                                  value={evt.type}
                                  onChange={(e) => {
                                    const next = [...overrideEvents];
                                    next[idx] = { ...next[idx], type: e.target.value as "CLOCK_IN" | "CLOCK_OUT" };
                                    setOverrideEvents(next);
                                  }}
                                >
                                  <option value="CLOCK_IN">Kommen</option>
                                  <option value="CLOCK_OUT">Gehen</option>
                                </select>
                                <input
                                  type="time"
                                  step={60}
                                  value={evt.time}
                                  onChange={(e) => {
                                    const next = [...overrideEvents];
                                    next[idx] = { ...next[idx], time: e.target.value.slice(0, 5) };
                                    setOverrideEvents(next);
                                  }}
                                />
                                <button
                                  className="secondary"
                                  type="button"
                                  onClick={() => setOverrideEvents((prev) => prev.filter((x) => x.id !== evt.id))}
                                >
                                  Entfernen
                                </button>
                              </div>
                            ))}
                            <button
                              className="secondary"
                              type="button"
                              onClick={() => setOverrideEvents((prev) => [...prev, { id: `new-${Date.now()}`, type: "CLOCK_IN", time: "" }])}
                            >
                              Ereignis hinzufuegen
                            </button>
                            <button
                              className="warn"
                              type="button"
                              onClick={() => setOverrideEvents([])}
                            >
                              Tag leeren
                            </button>
                          </div>
                          <textarea style={{ marginTop: 8 }} placeholder="Notiz (Pflichtfeld)" value={overrideNote} onChange={(e) => setOverrideNote(e.target.value)} />
                          <div className="row" style={{ marginTop: 8 }}>
                            {selectedIsAzubi && (
                              <button
                                className="secondary"
                                type="button"
                                disabled={saving}
                                onClick={async () => {
                                  try {
                                    setSaving(true);
                                    await api.dayOverrideBySupervisor({
                                      userId: monthUserId,
                                      date: d.date,
                                      note: "Berufsschule",
                                      events: [
                                        { type: "CLOCK_IN", time: "08:00" },
                                        { type: "CLOCK_OUT", time: "16:00" }
                                      ]
                                    });
                                    const mv = await loadMonth();
                                    const updatedDay = mv?.days?.find((x: any) => x.date === d.date);
                                    if (updatedDay) {
                                      setOverrideEvents(
                                        (updatedDay.entries || []).map((x: any, idx: number) => ({
                                          id: x.id || `${updatedDay.date}-${idx}`,
                                          type: x.type,
                                          time: x.time
                                        }))
                                      );
                                    }
                                    setOverrideNote("Berufsschule");
                                    setMsg("Berufsschule (8h) eingetragen.");
                                    setSelectedDay(d.date);
                                  } catch (e) {
                                    setMsg((e as Error).message);
                                  } finally {
                                    setSaving(false);
                                  }
                                }}
                              >
                                Berufsschule (8h)
                              </button>
                            )}
                            <button type="button" disabled={saving} onClick={async () => {
                              try {
                                setSaving(true);
                                if (!overrideNote.trim()) { setMsg("Notiz ist Pflicht."); return; }
                                const events = overrideEvents
                                  .map((x) => ({ type: x.type, time: x.time.trim().slice(0, 5) }))
                                  .filter((x) => x.time.length > 0);
                                if (events.some((x) => !/^([01]\d|2[0-3]):([0-5]\d)$/.test(x.time))) {
                                  setMsg("Ungueltige Uhrzeit.");
                                  return;
                                }
                                events.sort((a, b) => a.time.localeCompare(b.time));
                                await api.dayOverrideBySupervisor({ userId: monthUserId, date: d.date, note: overrideNote.trim(), events });
                                const mv = await loadMonth();
                                const updatedDay = mv?.days?.find((x: any) => x.date === d.date);
                                if (updatedDay) {
                                  setOverrideEvents(
                                    (updatedDay.entries || []).map((x: any, idx: number) => ({
                                      id: x.id || `${updatedDay.date}-${idx}`,
                                      type: x.type,
                                      time: x.time
                                    }))
                                  );
                                }
                                setMsg(events.length === 0 ? "Tag geleert." : `Tag aktualisiert (${events.length} Ereignisse).`);
                                setSelectedDay(d.date);
                              } catch (e) {
                                setMsg((e as Error).message);
                              } finally {
                                setSaving(false);
                              }
                            }}>Tag speichern</button>
                            <button className="secondary" type="button" onClick={() => setSelectedDay(null)}>Abbrechen</button>
                          </div>
                          {saving && <div style={{ marginTop: 8 }}>Speichert...</div>}
                          {msg && <div className={msg.includes("aktualisiert") ? "success" : "error"} style={{ marginTop: 8 }}>{msg}</div>}
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

      {msg && !selectedDay && <div className={msg.includes("aktualisiert") ? "success" : "error"} style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

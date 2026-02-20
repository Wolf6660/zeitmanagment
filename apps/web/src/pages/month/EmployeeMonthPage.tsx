import React, { useEffect, useState } from "react";
import { api, getSession } from "../../api/client";

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

export function EmployeeMonthPage() {
  const session = getSession();
  const now = new Date();
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [monthView, setMonthView] = useState<{
    monthPlanned: number;
    monthWorked: number;
    days: Array<{ date: string; plannedHours: number; workedHours: number; sickHours?: number; isSick?: boolean; isHoliday: boolean; isWeekend: boolean; specialWorkApprovalStatus?: "SUBMITTED" | "APPROVED" | "REJECTED" | null; entries: Array<{ id: string; type: "CLOCK_IN" | "CLOCK_OUT"; time: string; source?: string; reasonText?: string }> }>;
  } | null>(null);
  const [msg, setMsg] = useState("");
  const [actionMsg, setActionMsg] = useState("");

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
        <button
          className="secondary"
          onClick={async () => {
            try {
              const blob = await api.monthReportPdf(session.user.id, monthYear, monthNum);
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `stundenzettel-${session.user.loginName}-${monthYear}-${String(monthNum).padStart(2, "0")}.pdf`;
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
          onClick={async () => {
            try {
              await api.sendMonthReportMail({ userId: session.user.id, year: monthYear, month: monthNum, recipient: "SELF" });
              setActionMsg("Monatsbericht wurde per E-Mail versendet.");
            } catch (e) {
              setActionMsg((e as Error).message);
            }
          }}
        >
          Per Mail senden
        </button>
        {monthView && (
          <>
            <span>Monat Soll: <strong>{monthView.monthPlanned.toFixed(2)} h</strong></span>
            <span>Monat Ist: <strong>{monthView.monthWorked.toFixed(2)} h</strong></span>
          </>
        )}
      </div>
      {actionMsg && <div className={actionMsg.includes("versendet") || actionMsg.includes("heruntergeladen") ? "success" : "error"} style={{ marginBottom: 10 }}>{actionMsg}</div>}
      {monthView && (
        <table>
          <thead><tr><th>Datum</th><th>Soll</th><th>Ist</th><th>Buchungen</th><th>Notizen</th></tr></thead>
          <tbody>
            {monthView.days.map((d) => {
              const bg = dayRowBackground(d);
              return (
              <tr
                key={d.date}
                style={{ background: bg }}
              >
                <td>{d.date}</td>
                <td>{d.plannedHours.toFixed(2)}</td>
                <td style={{ color: d.workedHours !== d.plannedHours ? "var(--overtime)" : "inherit", fontWeight: d.workedHours !== d.plannedHours ? 600 : 400 }}>{d.workedHours.toFixed(2)}</td>
                <td>
                  {d.entries.map((e) => (
                    <span
                      key={e.id}
                      style={entryStyle(e.source)}
                    >
                      {e.type === "CLOCK_IN" ? "K" : "G"} {e.time}
                    </span>
                  ))}
                </td>
                <td>{Array.from(new Set(d.entries.map((e) => e.reasonText).filter((x): x is string => Boolean(x && x.trim())))).join(" | ") || "-"}</td>
              </tr>
            );})}
          </tbody>
        </table>
      )}
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

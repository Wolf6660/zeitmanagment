import React, { useEffect, useState } from "react";
import { api, type BreakCreditRequestRow, type SpecialWorkRequestRow } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

type MyLeaveRow = {
  id: string;
  status: string;
  kind: string;
  startDate: string;
  endDate: string;
  note?: string;
  requestedAt: string;
  decisionNote?: string | null;
  decidedAt?: string | null;
  decidedBy?: { id: string; name: string; loginName: string } | null;
};

type UnifiedMyRow = {
  id: string;
  source: "LEAVE" | "SPECIAL" | "BREAK";
  status: string;
  eventText: string;
  fromDate: string;
  toDate: string;
  requestedAtText: string;
  clockIn: string;
  clockOut: string;
  workedHoursText: string;
  requestNote: string;
  decisionNote: string;
  decidedByText: string;
  decidedAtText: string;
  canCancel: boolean;
};

function kindLabel(kind: string): string {
  return kind === "VACATION" ? "Urlaub" : "Ueberstunden";
}

function statusLabel(status: string): string {
  if (status === "SUBMITTED") return "Offen";
  if (status === "APPROVED") return "Genehmigt";
  if (status === "REJECTED") return "Abgelehnt";
  if (status === "CANCELED") return "Storniert";
  return status;
}

function statusBg(status: string): string {
  if (status === "APPROVED") return "rgba(34,197,94,0.10)";
  if (status === "REJECTED") return "rgba(239,68,68,0.10)";
  return "rgba(245,158,11,0.10)";
}

export function MyRequestsPage() {
  const [rows, setRows] = useState<UnifiedMyRow[]>([]);
  const [msg, setMsg] = useState("");
  const [leaveFormMsg, setLeaveFormMsg] = useState("");
  const [leaveFormOk, setLeaveFormOk] = useState(false);
  const [breakFormMsg, setBreakFormMsg] = useState("");
  const [breakFormOk, setBreakFormOk] = useState(false);
  const [kind, setKind] = useState<"VACATION" | "OVERTIME">("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [bcDate, setBcDate] = useState("");
  const [bcMinutes, setBcMinutes] = useState(30);
  const [bcReason, setBcReason] = useState("");

  async function load() {
    const [leaves, special, breakCredits] = await Promise.all([api.myLeaves(), api.mySpecialWork(), api.myBreakCreditRequests()]);

    const mappedLeaves: UnifiedMyRow[] = (leaves as MyLeaveRow[]).map((r) => ({
      id: r.id,
      source: "LEAVE",
      status: r.status,
      eventText: kindLabel(r.kind),
      fromDate: r.startDate.slice(0, 10),
      toDate: r.endDate.slice(0, 10),
      requestedAtText: new Date(r.requestedAt).toLocaleString("de-DE"),
      clockIn: "-",
      clockOut: "-",
      workedHoursText: "-",
      requestNote: r.note || "-",
      decisionNote: r.decisionNote || "-",
      decidedByText: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-",
      decidedAtText: r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-",
      canCancel: r.status === "SUBMITTED"
    }));

    const mappedSpecial: UnifiedMyRow[] = (special as SpecialWorkRequestRow[]).map((r) => ({
      id: r.id,
      source: "SPECIAL",
      status: r.status,
      eventText: r.eventType || "Sonderantrag",
      fromDate: r.date,
      toDate: "-",
      requestedAtText: new Date(r.createdAt).toLocaleString("de-DE"),
      clockIn: (r.clockInTimes || []).join(", ") || "-",
      clockOut: (r.clockOutTimes || []).join(", ") || "-",
      workedHoursText: `${(r.workedHours ?? 0).toFixed(2)} h`,
      requestNote: "-",
      decisionNote: r.note || "-",
      decidedByText: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-",
      decidedAtText: r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-",
      canCancel: false
    }));

    const mappedBreakCredits: UnifiedMyRow[] = (breakCredits as BreakCreditRequestRow[]).map((r) => ({
      id: r.id,
      source: "BREAK",
      status: r.status,
      eventText: "Pausengutschrift",
      fromDate: r.date,
      toDate: "-",
      requestedAtText: new Date(r.requestedAt).toLocaleString("de-DE"),
      clockIn: "-",
      clockOut: "-",
      workedHoursText: `${r.minutes} min`,
      requestNote: r.reason,
      decisionNote: r.decisionNote || "-",
      decidedByText: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-",
      decidedAtText: r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-",
      canCancel: r.status === "SUBMITTED"
    }));

    const sorted = [...mappedLeaves, ...mappedSpecial, ...mappedBreakCredits].sort((a, b) => {
      if (a.status === "SUBMITTED" && b.status !== "SUBMITTED") return -1;
      if (a.status !== "SUBMITTED" && b.status === "SUBMITTED") return 1;
      return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime();
    });
    setRows(sorted);
  }

  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Urlaub / AZ</h2>
      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <h4>Neuen Antrag stellen</h4>
        <div className="grid">
          <select value={kind} onChange={(e) => setKind(e.target.value as "VACATION" | "OVERTIME")}>
            <option value="VACATION">Urlaub</option>
            <option value="OVERTIME">Ueberstundenabbau (AZ)</option>
          </select>
          <div className="row">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <textarea placeholder="Notiz (Pflichtfeld)" value={note} onChange={(e) => setNote(e.target.value)} />
          <button onClick={async () => {
            try {
              setLeaveFormOk(false);
              if (!note.trim()) { setLeaveFormMsg("Notiz ist Pflicht."); return; }
              await api.createLeave({ kind, startDate, endDate, note: note.trim() });
              setLeaveFormOk(true);
              setLeaveFormMsg("Antrag gestellt.");
              setStartDate("");
              setEndDate("");
              setNote("");
              await load();
            } catch (e) {
              setLeaveFormOk(false);
              setLeaveFormMsg((e as Error).message);
            }
          }}>Antrag senden</button>
          {leaveFormMsg && <div className={leaveFormOk ? "success" : "error"}>{leaveFormMsg}</div>}
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <h4>Pausengutschrift beantragen</h4>
        <div className="grid">
          <div className="row">
            <input type="date" value={bcDate} onChange={(e) => setBcDate(e.target.value)} />
            <input type="number" min={1} max={180} value={bcMinutes} onChange={(e) => setBcMinutes(Number(e.target.value || 0))} />
          </div>
          <textarea placeholder="Notiz (Pflichtfeld)" value={bcReason} onChange={(e) => setBcReason(e.target.value)} />
          <button onClick={async () => {
            try {
              setBreakFormOk(false);
              if (!bcDate) { setBreakFormMsg("Datum ist Pflicht."); return; }
              if (!bcReason.trim()) { setBreakFormMsg("Notiz ist Pflicht."); return; }
              if (!Number.isFinite(bcMinutes) || bcMinutes < 1 || bcMinutes > 180) { setBreakFormMsg("Minuten muessen zwischen 1 und 180 liegen."); return; }
              await api.createBreakCreditRequest({ date: bcDate, minutes: Math.floor(bcMinutes), reason: bcReason.trim() });
              setBreakFormOk(true);
              setBreakFormMsg("Pausengutschrift-Antrag gestellt.");
              setBcReason("");
              await load();
            } catch (e) {
              setBreakFormOk(false);
              setBreakFormMsg((e as Error).message);
            }
          }}>Pausengutschrift beantragen</button>
          {breakFormMsg && <div className={breakFormOk ? "success" : "error"}>{breakFormMsg}</div>}
        </div>
      </div>

      <h4>Meine Antraege</h4>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Ereignis</th>
              <th>Von/Datum</th>
              <th>Bis</th>
              <th>Kommen</th>
              <th>Gehen</th>
              <th>Gesamtstunden</th>
              <th>Eingang</th>
              <th>Antragsnotiz</th>
              <th>Entscheidungsnotiz</th>
              <th>Entscheider</th>
              <th>Entscheidungsdatum</th>
              <th>Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}-${r.id}`} style={{ background: statusBg(r.status) }}>
                <td>
                  {r.status === "APPROVED" ? (
                    <StatusBadge text="Genehmigt" color="var(--approved)" />
                  ) : r.status === "REJECTED" ? (
                    <StatusBadge text="Abgelehnt" color="var(--rejected)" />
                  ) : (
                    <StatusBadge text={statusLabel(r.status)} color="var(--warning)" />
                  )}
                </td>
                <td>{r.eventText}</td>
                <td>{r.fromDate}</td>
                <td>{r.toDate}</td>
                <td>{r.clockIn}</td>
                <td>{r.clockOut}</td>
                <td>{r.workedHoursText}</td>
                <td>{r.requestedAtText}</td>
                <td>{r.requestNote}</td>
                <td>{r.decisionNote}</td>
                <td>{r.decidedByText}</td>
                <td>{r.decidedAtText}</td>
                <td>
                  {r.canCancel ? (
                    <button
                      className="secondary"
                      onClick={async () => {
                        try {
                          if (r.source === "LEAVE") {
                            await api.cancelLeave(r.id);
                          } else if (r.source === "BREAK") {
                            await api.cancelBreakCreditRequest(r.id);
                          }
                          setMsg("Antrag storniert.");
                          await load();
                        } catch (e) {
                          setMsg((e as Error).message);
                        }
                      }}
                    >
                      Stornieren
                    </button>
                  ) : "-"}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={13}>Keine Antraege vorhanden.</td></tr>}
          </tbody>
        </table>
      </div>
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

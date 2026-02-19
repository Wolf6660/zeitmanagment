import React, { useEffect, useState } from "react";
import { api, type SpecialWorkRequestRow } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

type LeaveRow = {
  id: string;
  status: string;
  kind: string;
  startDate: string;
  endDate: string;
  note?: string;
  requestedAt: string;
  decisionNote?: string | null;
  decidedAt?: string | null;
  user: { id: string; name: string; loginName: string };
  decidedBy?: { id: string; name: string; loginName: string } | null;
};

type UnifiedRow = {
  id: string;
  source: "LEAVE" | "SPECIAL";
  status: string;
  employeeText: string;
  eventText: string;
  fromDate: string;
  toDate: string;
  requestedAt: string;
  clockIn: string;
  clockOut: string;
  workedHoursText: string;
  requestNote: string;
  decisionNote: string;
  decidedByText: string;
  decidedAtText: string;
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

export function RequestsPage() {
  const [rows, setRows] = useState<UnifiedRow[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Promise.all([api.allLeaves(), api.allSpecialWork()])
      .then(([leaveRows, specialRows]) => {
        const mappedLeaves: UnifiedRow[] = (leaveRows as LeaveRow[]).map((r) => ({
          id: r.id,
          source: "LEAVE",
          status: r.status,
          employeeText: `${r.user.name} (${r.user.loginName})`,
          eventText: kindLabel(r.kind),
          fromDate: r.startDate.slice(0, 10),
          toDate: r.endDate.slice(0, 10),
          requestedAt: r.requestedAt,
          clockIn: "-",
          clockOut: "-",
          workedHoursText: "-",
          requestNote: r.note || "-",
          decisionNote: r.decisionNote || "-",
          decidedByText: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-",
          decidedAtText: r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-"
        }));

        const mappedSpecial: UnifiedRow[] = (specialRows as SpecialWorkRequestRow[]).map((r) => ({
          id: r.id,
          source: "SPECIAL",
          status: r.status,
          employeeText: `${r.user.name} (${r.user.loginName})`,
          eventText: r.eventType || "Sonderantrag",
          fromDate: r.date,
          toDate: "-",
          requestedAt: r.createdAt,
          clockIn: (r.clockInTimes || []).join(", ") || "-",
          clockOut: (r.clockOutTimes || []).join(", ") || "-",
          workedHoursText: `${(r.workedHours ?? 0).toFixed(2)} h`,
          requestNote: "-",
          decisionNote: r.note || "-",
          decidedByText: r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-",
          decidedAtText: r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-"
        }));

        const all = [...mappedLeaves, ...mappedSpecial].sort((a, b) => {
          if (a.status === "SUBMITTED" && b.status !== "SUBMITTED") return -1;
          if (a.status !== "SUBMITTED" && b.status === "SUBMITTED") return 1;
          return new Date(b.fromDate).getTime() - new Date(a.fromDate).getTime();
        });
        setRows(all);
      })
      .catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Antragsuebersicht</h2>
      <div className="admin-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Mitarbeiter</th>
              <th>Status</th>
              <th>Ereignis</th>
              <th>Von/Datum</th>
              <th>Bis</th>
              <th>Kommen</th>
              <th>Gehen</th>
              <th>Gesamtstunden</th>
              <th>Antragsnotiz</th>
              <th>Entscheidungsnotiz</th>
              <th>Entscheider</th>
              <th>Entscheidungsdatum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.source}-${r.id}`} style={{ background: statusBg(r.status) }}>
                <td>{r.employeeText}</td>
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
                <td>{r.requestNote}</td>
                <td>{r.decisionNote}</td>
                <td>{r.decidedByText}</td>
                <td>{r.decidedAtText}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={12}>Keine Antraege vorhanden.</td></tr>}
          </tbody>
        </table>
      </div>
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

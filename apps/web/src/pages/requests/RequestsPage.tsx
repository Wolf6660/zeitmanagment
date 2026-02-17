import React, { useEffect, useState } from "react";
import { api } from "../../api/client";
import { StatusBadge } from "../../components/StatusBadge";

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

export function RequestsPage() {
  const [rows, setRows] = useState<Array<{
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
  }>>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.allLeaves().then(setRows).catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Antragsuebersicht</h2>
      <table>
        <thead>
          <tr>
            <th>Mitarbeiter</th>
            <th>Status</th>
            <th>Typ</th>
            <th>Von</th>
            <th>Bis</th>
            <th>Antragsnotiz</th>
            <th>Entscheidungsnotiz</th>
            <th>Entscheider</th>
            <th>Entscheidungsdatum</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              style={{
                background:
                  r.status === "APPROVED"
                    ? "rgba(34,197,94,0.10)"
                    : r.status === "REJECTED"
                      ? "rgba(239,68,68,0.10)"
                      : "rgba(245,158,11,0.10)"
              }}
            >
              <td>{r.user.name} ({r.user.loginName})</td>
              <td>
                {r.status === "APPROVED" ? (
                  <StatusBadge text="Genehmigt" color="var(--approved)" />
                ) : r.status === "REJECTED" ? (
                  <StatusBadge text="Abgelehnt" color="var(--rejected)" />
                ) : (
                  <StatusBadge text={statusLabel(r.status)} color="var(--warning)" />
                )}
              </td>
              <td>{kindLabel(r.kind)}</td>
              <td>{r.startDate.slice(0, 10)}</td>
              <td>{r.endDate.slice(0, 10)}</td>
              <td>{r.note || "-"}</td>
              <td>{r.decisionNote || "-"}</td>
              <td>{r.decidedBy ? `${r.decidedBy.name} (${r.decidedBy.loginName})` : "-"}</td>
              <td>{r.decidedAt ? new Date(r.decidedAt).toLocaleString("de-DE") : "-"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={9}>Keine Antraege vorhanden.</td></tr>}
        </tbody>
      </table>
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

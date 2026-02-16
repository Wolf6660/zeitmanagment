import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

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
            <tr key={r.id}>
              <td>{r.user.name} ({r.user.loginName})</td>
              <td>{statusLabel(r.status)}</td>
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

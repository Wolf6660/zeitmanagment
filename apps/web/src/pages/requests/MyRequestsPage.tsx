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

export function MyRequestsPage() {
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
    decidedBy?: { id: string; name: string; loginName: string } | null;
  }>>([]);
  const [msg, setMsg] = useState("");
  const [kind, setKind] = useState<"VACATION" | "OVERTIME">("VACATION");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");

  async function load() {
    const data = await api.myLeaves();
    const sorted = [...data].sort((a, b) => {
      if (a.status === "SUBMITTED" && b.status !== "SUBMITTED") return -1;
      if (a.status !== "SUBMITTED" && b.status === "SUBMITTED") return 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
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
              if (!note.trim()) { setMsg("Notiz ist Pflicht."); return; }
              await api.createLeave({ kind, startDate, endDate, note: note.trim() });
              setMsg("Antrag gestellt.");
              setStartDate("");
              setEndDate("");
              setNote("");
              await load();
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}>Antrag senden</button>
        </div>
      </div>

      <h4>Meine Antraege</h4>
      <table>
        <thead>
          <tr>
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
          {rows.length === 0 && <tr><td colSpan={8}>Keine Antraege vorhanden.</td></tr>}
        </tbody>
      </table>
      {msg && <div className="error" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

export function SupervisorHome() {
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; role: string; annualVacationDays: number; carryOverVacationDays: number }>>([]);
  const [pending, setPending] = useState<Array<{ id: string; kind: string; startDate: string; endDate: string; note?: string; user: { name: string } }>>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Promise.all([api.employees(), api.pendingLeaves()])
      .then(([e, p]) => {
        setEmployees(e);
        setPending(p);
      })
      .catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="grid grid-2">
      <div className="card">
        <h2>Stundenaufzeichnung Mitarbeiter</h2>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Rolle</th>
              <th>Jahresurlaub</th>
              <th>Resturlaub Vorjahr</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.name}</td>
                <td>{e.role}</td>
                <td>{e.annualVacationDays}</td>
                <td>{e.carryOverVacationDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Urlaubsantraege offen</h2>
        <div className="grid">
          {pending.map((p) => (
            <div key={p.id} className="card" style={{ padding: 12 }}>
              <div><strong>{p.user.name}</strong></div>
              <div>{p.kind}: {p.startDate.slice(0, 10)} bis {p.endDate.slice(0, 10)}</div>
              <div>{p.note || "-"}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button onClick={async () => {
                  await api.decideLeave({ leaveId: p.id, decision: "APPROVED" });
                  setPending(await api.pendingLeaves());
                }}>Genehmigen</button>
                <button className="secondary" onClick={async () => {
                  await api.decideLeave({ leaveId: p.id, decision: "REJECTED" });
                  setPending(await api.pendingLeaves());
                }}>Ablehnen</button>
              </div>
            </div>
          ))}
          {pending.length === 0 && <div>Keine offenen Antraege.</div>}
          {msg && <div className="error">{msg}</div>}
        </div>
      </div>
    </div>
  );
}

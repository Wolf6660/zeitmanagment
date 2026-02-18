import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

export function SicknessPage() {
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [userId, setUserId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [deleteDate, setDeleteDate] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.employees()
      .then((rows) => {
        setEmployees(rows.map((r) => ({ id: r.id, name: r.name })));
        setUserId(rows[0]?.id || "");
      })
      .catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Krankheit</h2>
      <div className="grid grid-2">
        <label>
          Mitarbeiter
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <label>
          Startdatum
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Enddatum
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          Notiz
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          onClick={async () => {
            try {
              if (!userId || !startDate || !endDate) {
                setMsg("Bitte Mitarbeiter, Start- und Enddatum ausfuellen.");
                return;
              }
              await api.createSickLeave({ userId, startDate, endDate, note: note.trim() || undefined });
              setMsg("Krankheit eingetragen.");
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Krankheit speichern
        </button>
      </div>

      <hr style={{ margin: "16px 0" }} />

      <div className="grid grid-2">
        <label>
          Krankheitstag loeschen
          <input type="date" value={deleteDate} onChange={(e) => setDeleteDate(e.target.value)} />
        </label>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          className="secondary"
          onClick={async () => {
            try {
              if (!userId || !deleteDate) {
                setMsg("Bitte Mitarbeiter und Datum ausfuellen.");
                return;
              }
              await api.deleteSickLeaveDay({ userId, date: deleteDate });
              setMsg("Krankheitstag geloescht.");
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Krankheitstag entfernen
        </button>
      </div>
      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}


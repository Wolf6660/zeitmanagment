import React, { useEffect, useState } from "react";
import { api } from "../../api/client";

type Holiday = { id: string; date: string; name: string };

export function HolidaysPage() {
  const [items, setItems] = useState<Holiday[]>([]);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editName, setEditName] = useState("");
  const [msg, setMsg] = useState("");

  async function load() {
    const rows = await api.holidays();
    setItems(rows);
  }

  useEffect(() => {
    load().catch((e) => setMsg((e as Error).message));
  }, []);

  return (
    <div className="card">
      <h2>Feiertage</h2>
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
        <input placeholder="Bezeichnung" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button onClick={async () => {
          try {
            if (!newDate || !newName.trim()) {
              setMsg("Datum und Bezeichnung sind Pflicht.");
              return;
            }
            await api.createHoliday({ date: newDate, name: newName.trim() });
            setNewDate("");
            setNewName("");
            await load();
            setMsg("Feiertag gespeichert.");
          } catch (e) {
            setMsg((e as Error).message);
          }
        }}>Hinzufuegen</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Bezeichnung</th>
            <th>Aktion</th>
          </tr>
        </thead>
        <tbody>
          {items.map((h) => {
            const editing = editId === h.id;
            return (
              <tr key={h.id}>
                <td>{editing ? <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} /> : h.date}</td>
                <td>{editing ? <input value={editName} onChange={(e) => setEditName(e.target.value)} /> : h.name}</td>
                <td>
                  {!editing && (
                    <div className="row">
                      <button className="secondary" onClick={() => {
                        setEditId(h.id);
                        setEditDate(h.date);
                        setEditName(h.name);
                      }}>Bearbeiten</button>
                      <button className="warn" onClick={async () => {
                        try {
                          await api.deleteHoliday(h.id);
                          await load();
                          setMsg("Feiertag geloescht.");
                        } catch (e) {
                          setMsg((e as Error).message);
                        }
                      }}>Loeschen</button>
                    </div>
                  )}
                  {editing && (
                    <div className="row">
                      <button onClick={async () => {
                        try {
                          if (!editDate || !editName.trim()) {
                            setMsg("Datum und Bezeichnung sind Pflicht.");
                            return;
                          }
                          await api.updateHoliday(h.id, { date: editDate, name: editName.trim() });
                          setEditId(null);
                          await load();
                          setMsg("Feiertag aktualisiert.");
                        } catch (e) {
                          setMsg((e as Error).message);
                        }
                      }}>Speichern</button>
                      <button className="secondary" onClick={() => setEditId(null)}>Abbrechen</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
          {items.length === 0 && (
            <tr><td colSpan={3}>Keine Feiertage vorhanden.</td></tr>
          )}
        </tbody>
      </table>

      {msg && <div className={msg.includes("Feiertag") ? "success" : "error"} style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

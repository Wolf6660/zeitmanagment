import React, { useState } from "react";
import { api } from "../../api/client";

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="card">
      <h2>Kennwort aendern</h2>
      <div className="grid admin-uniform" style={{ maxWidth: 640 }}>
        <label>
          Aktuelles Kennwort
          <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label>
          Neues Kennwort
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </label>
        <label>
          Neues Kennwort wiederholen
          <input type="password" value={newPasswordRepeat} onChange={(e) => setNewPasswordRepeat(e.target.value)} />
        </label>
        <div style={{ color: "var(--muted)", fontSize: 12 }}>
          Passwort: mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen.
        </div>
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <button
          disabled={saving}
          onClick={async () => {
            try {
              setMsg("");
              if (newPassword !== newPasswordRepeat) {
                setMsg("Neue Passwoerter stimmen nicht ueberein.");
                return;
              }
              if (!/^.{8,}$/.test(newPassword) || !/([0-9]|[^A-Za-z0-9])/.test(newPassword)) {
                setMsg("Passwort muss mindestens 8 Zeichen und mindestens eine Zahl oder ein Sonderzeichen enthalten.");
                return;
              }
              setSaving(true);
              const r = await api.changePassword({ currentPassword, newPassword });
              setMsg(r.message || "Passwort geaendert.");
              setCurrentPassword("");
              setNewPassword("");
              setNewPasswordRepeat("");
            } catch (e) {
              setMsg((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          Kennwort speichern
        </button>
      </div>
      {msg && (
        <div className={msg.toLowerCase().includes("geaendert") ? "success" : "error"} style={{ marginTop: 10 }}>
          {msg}
        </div>
      )}
    </div>
  );
}


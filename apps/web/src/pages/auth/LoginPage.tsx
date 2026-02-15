import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setSession } from "../../api/client";

export function LoginPage() {
  const navigate = useNavigate();
  const [loginName, setLoginName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="page" style={{ maxWidth: 460 }}>
      <div className="card">
        <h1>Zeitmanagment Login</h1>
        <p>Loginname + Passwort</p>
        <div className="grid">
          <input value={loginName} onChange={(e) => setLoginName(e.target.value)} placeholder="Loginname" />
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Passwort" />
          <button
            onClick={async () => {
              try {
                setError("");
                const session = await api.login({ loginName, password });
                setSession(session);
                navigate("/app", { replace: true });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Einloggen
          </button>
          {error && <div className="error">{error}</div>}
        </div>
      </div>
    </div>
  );
}

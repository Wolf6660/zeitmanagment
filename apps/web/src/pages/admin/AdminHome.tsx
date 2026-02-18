import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client";
import { getSession } from "../../api/client";
import type { PublicConfig } from "../../styles/theme";
import { applyTheme } from "../../styles/theme";

type AdminConfig = {
  companyName: string;
  systemName: string;
  companyLogoUrl?: string | null;
  defaultDailyHours: number;
  defaultWeeklyWorkingDays?: string;
  selfCorrectionMaxDays?: number;
  autoBreakMinutes: number;
  autoBreakAfterHours: number;
  requireApprovalForCrossMidnight?: boolean;
  requireReasonWebClock?: boolean;
  requireNoteSelfCorrection?: boolean;
  requireNoteSupervisorCorrection?: boolean;
  requireNoteLeaveRequest?: boolean;
  requireNoteLeaveDecision?: boolean;
  requireNoteLeaveSupervisorUpdate?: boolean;
  requireNoteOvertimeAdjustment?: boolean;
  requireNoteOvertimeAccountSet?: boolean;
  colorApproved: string;
  colorRejected: string;
  colorManualCorrection: string;
  colorBreakCredit: string;
  colorSickLeave: string;
  colorHolidayOrWeekend: string;
  colorHolidayOrWeekendWork: string;
  colorVacationWarning: string;
  colorWebEntry: string;
  colorOvertime: string;
  smtpEnabled?: boolean;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpUser?: string | null;
  smtpPassword?: string | null;
  smtpFrom?: string | null;
  smtpSenderName?: string | null;
  accountantMailEnabled?: boolean;
  accountantEmail?: string | null;
  mailOnEmployeeLeaveDecision?: boolean;
  mailOnEmployeeOvertimeDecision?: boolean;
  mailOnEmployeeLongShift?: boolean;
  mailOnSupervisorLeaveRequest?: boolean;
  mailOnSupervisorOvertimeRequest?: boolean;
  mailOnSupervisorCrossMidnight?: boolean;
  mailOnSupervisorUnknownRfid?: boolean;
  mailOnAdminUnknownRfid?: boolean;
  mailOnAdminSystemError?: boolean;
};

type Terminal = {
  id: string;
  name: string;
  location?: string;
  isActive: boolean;
  apiKey: string;
  lastSeenAt?: string;
};

type UnassignedRfidScan = {
  rfidTag: string;
  seenCount: number;
  lastSeenAt: string;
  terminalId?: string;
  terminalName?: string;
  lastType?: string;
  lastReasonText?: string | null;
};

type Employee = {
  id: string;
  name: string;
  email: string;
  role: "EMPLOYEE" | "SUPERVISOR" | "ADMIN";
  isActive: boolean;
  annualVacationDays: number;
  carryOverVacationDays: number;
  loginName: string;
  mailNotificationsEnabled: boolean;
  webLoginEnabled: boolean;
  timeTrackingEnabled: boolean;
  dailyWorkHours?: number | null;
  rfidTag?: string | null;
};

const COLOR_FIELDS: Array<{ key: keyof AdminConfig; label: string }> = [
  { key: "colorApproved", label: "Genehmigt" },
  { key: "colorRejected", label: "Abgelehnt" },
  { key: "colorManualCorrection", label: "Manuelle Korrektur" },
  { key: "colorWebEntry", label: "Web-Einstempeln" },
  { key: "colorBreakCredit", label: "Pausengutschrift" },
  { key: "colorSickLeave", label: "Krankheit" },
  { key: "colorHolidayOrWeekend", label: "Wochenende / Feiertag" },
  { key: "colorHolidayOrWeekendWork", label: "Arbeit Feiertag/Wochenende" },
  { key: "colorVacationWarning", label: "Urlaub" },
  { key: "colorOvertime", label: "Ueberstunden" }
];

function toBoolLiteral(v: unknown): string {
  return v ? "true" : "false";
}

function toNum(v: unknown, fallback: number): number {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function toStr(v: unknown, fallback = ""): string {
  const s = String(v ?? fallback);
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildConfigLocalHeaderFromProvisionJson(raw: string): string {
  const obj = JSON.parse(raw) as any;
  const network = obj?.network || {};
  const server = obj?.server || {};
  const terminal = obj?.terminal || {};
  const hardware = obj?.hardware || {};
  const pins = hardware?.pins || {};
  const display = hardware?.display || {};
  const displayPins = display?.pins || {};
  const behaviour = obj?.displayBehaviour || {};

  const lines = [
    "#pragma once",
    "",
    "// Automatisch aus ESP32 Provisioning erzeugt",
    `#define LOCAL_WIFI_SSID "${toStr(network.wifiSsid)}"`,
    `#define LOCAL_WIFI_PASSWORD "${toStr(network.wifiPassword)}"`,
    `#define LOCAL_SERVER_ENDPOINT "${toStr(server.endpoint)}"`,
    `#define LOCAL_USE_TLS ${toBoolLiteral(server.useTls)}`,
    `#define LOCAL_TERMINAL_KEY "${toStr(terminal.key)}"`,
    "",
    `#define LOCAL_READER_TYPE "${toStr(hardware.readerType || "RC522")}"`,
    `#define LOCAL_PN532_MODE "${toStr(hardware.pn532Mode || "I2C")}"`,
    "",
    `#define LOCAL_PIN_SDA ${toNum(pins.sda, 21)}`,
    `#define LOCAL_PIN_SCL ${toNum(pins.scl, 22)}`,
    `#define LOCAL_PIN_MOSI ${toNum(pins.mosi, 23)}`,
    `#define LOCAL_PIN_MISO ${toNum(pins.miso, 19)}`,
    `#define LOCAL_PIN_SCK ${toNum(pins.sck, 18)}`,
    `#define LOCAL_PIN_SS ${toNum(pins.ss, 27)}`,
    `#define LOCAL_PIN_RST ${toNum(pins.rst, 26)}`,
    `#define LOCAL_PIN_IRQ ${toNum(pins.irq, 4)}`,
    "",
    `#define LOCAL_DISPLAY_ENABLED ${toBoolLiteral(display.enabled)}`,
    `#define LOCAL_DISPLAY_ROWS ${toNum(display.rows, 4)}`,
    `#define LOCAL_DISPLAY_SDA ${toNum(displayPins.sda, 21)}`,
    `#define LOCAL_DISPLAY_SCL ${toNum(displayPins.scl, 22)}`,
    `#define LOCAL_DISPLAY_ADDRESS "${toStr(displayPins.address || "0x27")}"`,
    `#define LOCAL_IDLE_LINE1 "${toStr(behaviour.idleLine1 || "Firmenname")}"`,
    "",
    `#define LOCAL_TIMEZONE "${toStr(obj?.timezone || "CET-1CEST,M3.5.0/2,M10.5.0/3")}"`,
    `#define LOCAL_NTP_SERVER "${toStr(obj?.ntpServer || "pool.ntp.org")}"`,
    `#define LOCAL_TIME_OFFSET_HOURS ${toNum(obj?.timeOffsetHours, 0)}`,
    ""
  ];
  return lines.join("\n");
}

export function AdminHome() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get("section") || "company";

  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [logs, setLogs] = useState<Array<{ id: string; actorLoginName: string; action: string; targetType?: string; createdAt: string; payloadJson?: string }>>([]);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingEmployee, setEditingEmployee] = useState<Partial<Employee>>({});
  const [terminalName, setTerminalName] = useState("");
  const [terminalLocation, setTerminalLocation] = useState("");
  const [espTerminalId, setEspTerminalId] = useState("");
  const [espWifiSsid, setEspWifiSsid] = useState("");
  const [espWifiPassword, setEspWifiPassword] = useState("");
  const [espServerHost, setEspServerHost] = useState("");
  const [espServerPort, setEspServerPort] = useState(4000);
  const [espUseTls, setEspUseTls] = useState(false);
  const [espReaderType, setEspReaderType] = useState<"RC522" | "PN532">("RC522");
  const [espPn532Mode, setEspPn532Mode] = useState<"I2C" | "SPI">("I2C");
  const [espDisplayEnabled, setEspDisplayEnabled] = useState(true);
  const [espDisplayRows, setEspDisplayRows] = useState(4);
  const [espDisplaySda, setEspDisplaySda] = useState(21);
  const [espDisplayScl, setEspDisplayScl] = useState(22);
  const [espDisplayAddress, setEspDisplayAddress] = useState("0x27");
  const [espPins, setEspPins] = useState<{ sda?: number; scl?: number; mosi?: number; miso?: number; sck?: number; ss?: number; rst?: number; irq?: number }>({
    sck: 18,
    miso: 19,
    mosi: 23,
    ss: 27,
    rst: 26
  });
  const [espConfigPreview, setEspConfigPreview] = useState("");
  const [unassignedRfid, setUnassignedRfid] = useState<UnassignedRfidScan[]>([]);
  const [assignRfidTag, setAssignRfidTag] = useState("");
  const [assignRfidUserId, setAssignRfidUserId] = useState("");
  const [assignRfidNote, setAssignRfidNote] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [msg, setMsg] = useState("");
  const session = getSession();

  const [otUserId, setOtUserId] = useState("");
  const [otTargetHours, setOtTargetHours] = useState(0);
  const [otCurrentHours, setOtCurrentHours] = useState(0);
  const [otNote, setOtNote] = useState("");
  const [otHistory, setOtHistory] = useState<Array<{ id: string; date: string; hours: number; reason: string; createdAt: string }>>([]);
  const [bulkUserId, setBulkUserId] = useState("");
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkEndDate, setBulkEndDate] = useState("");
  const [bulkClockIn, setBulkClockIn] = useState("08:00");
  const [bulkClockOut, setBulkClockOut] = useState("17:00");
  const [bulkNote, setBulkNote] = useState("");

  const [newEmployee, setNewEmployee] = useState({
    name: "",
    email: "",
    loginName: "",
    password: "",
    role: "EMPLOYEE" as "EMPLOYEE" | "SUPERVISOR" | "ADMIN",
    annualVacationDays: 30,
    dailyWorkHours: 8,
    carryOverVacationDays: 0,
    mailNotificationsEnabled: true,
    webLoginEnabled: true,
    rfidTag: ""
  });

  async function loadData() {
    const [cfg, trms, emps, scans] = await Promise.all([api.getConfig(), api.listTerminals(), api.employees(), api.listUnassignedRfidScans()]);
    setConfig(cfg);
    setTerminals(trms);
    setEmployees(emps as Employee[]);
    setUnassignedRfid(scans);
    setOtUserId((prev) => prev || (emps[0]?.id ?? ""));
    setBulkUserId((prev) => prev || (emps[0]?.id ?? ""));
    setAssignRfidUserId((prev) => prev || (emps[0]?.id ?? ""));
    setEspTerminalId((prev) => prev || (trms[0]?.id ?? ""));
    applyTheme(cfg as PublicConfig);
  }

  useEffect(() => {
    loadData().catch((e) => setMsg((e as Error).message));
  }, []);

  useEffect(() => {
    if (section === "logs") {
      api.listAuditLogs().then(setLogs).catch((e) => setMsg((e as Error).message));
    }
  }, [section]);

  useEffect(() => {
    if (section === "overtime" && otUserId) {
      Promise.all([api.overtimeAdjustments(otUserId), api.overtimeAccount(otUserId)])
        .then(([history, account]) => {
          setOtHistory(history);
          setOtCurrentHours(account.overtimeBalanceHours);
          setOtTargetHours(account.overtimeBalanceHours);
        })
        .catch((e) => setMsg((e as Error).message));
    }
  }, [section, otUserId]);

  const sectionTitle = useMemo(() => {
    if (section === "company") return "Firmenstammdaten";
    if (section === "rules") return "Regeln";
    if (section === "colors") return "Farben";
    if (section === "mail") return "E-Mail";
    if (section === "employees") return "Mitarbeiter";
    if (section === "overtime") return "Ueberstunden";
    if (section === "bulk") return "Stapelerfassung";
    if (section === "terminals") return "RFID-Terminals";
    if (section === "esp") return "ESP32 Provisioning";
    if (section === "logs") return "Log";
    return "Admin";
  }, [section]);

  if (!config) {
    return <div className="card">Konfiguration wird geladen...</div>;
  }

  return (
    <div className="card">
      <h2>Admin</h2>
      <div className="row" style={{ marginBottom: 12 }}>
        <button onClick={() => setSearchParams({ section: "company" })}>Firmenstammdaten</button>
        <button onClick={() => setSearchParams({ section: "rules" })}>Regeln</button>
        <button onClick={() => setSearchParams({ section: "colors" })}>Farben</button>
        <button onClick={() => setSearchParams({ section: "mail" })}>E-Mail</button>
        <button onClick={() => setSearchParams({ section: "employees" })}>Mitarbeiter</button>
        <button onClick={() => setSearchParams({ section: "overtime" })}>Ueberstunden</button>
        <button onClick={() => setSearchParams({ section: "bulk" })}>Stapelerfassung</button>
        <button onClick={() => setSearchParams({ section: "terminals" })}>RFID-Terminals</button>
        <button onClick={() => setSearchParams({ section: "esp" })}>ESP32 Provisioning</button>
        <button onClick={() => setSearchParams({ section: "logs" })}>Log</button>
      </div>

      <h3>{sectionTitle}</h3>

      {section === "company" && (
        <div className="grid admin-section">
          <label>
            Firmenname
            <input value={config.companyName || ""} onChange={(e) => setConfig({ ...config, companyName: e.target.value })} />
          </label>
          <label>
            Systemname
            <input value={config.systemName || ""} onChange={(e) => setConfig({ ...config, systemName: e.target.value })} />
          </label>
          <label>
            Firmenlogo hochladen (PNG/JPG)
            <input type="file" accept="image/png,image/jpeg" onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)} />
            <button className="secondary" type="button" style={{ marginTop: 6 }} onClick={async () => {
              try {
                if (!logoFile) {
                  setMsg("Bitte zuerst eine Datei waehlen.");
                  return;
                }
                const buffer = await logoFile.arrayBuffer();
                const bytes = new Uint8Array(buffer);
                let binary = "";
                for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
                const base64 = btoa(binary);
                const uploaded = await api.uploadLogo({ filename: logoFile.name, contentBase64: base64 });
                setConfig({ ...config, companyLogoUrl: uploaded.logoUrl });
                setMsg("Logo hochgeladen.");
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}>Logo hochladen</button>
          </label>
        </div>
      )}

      {section === "rules" && (
        <div className="grid admin-section">
          <label>
            Standard Sollarbeitszeit/Tag
            <input type="number" step="0.25" value={config.defaultDailyHours} onChange={(e) => setConfig({ ...config, defaultDailyHours: Number(e.target.value) })} />
          </label>
          <label>
            Automatische Pause (Minuten)
            <input type="number" value={config.autoBreakMinutes} onChange={(e) => setConfig({ ...config, autoBreakMinutes: Number(e.target.value) })} />
          </label>
          <label>
            Pause automatisch ab (Stunden)
            <input type="number" value={config.autoBreakAfterHours} onChange={(e) => setConfig({ ...config, autoBreakAfterHours: Number(e.target.value) })} />
          </label>
          <label>
            Rueckwirkender Nachtrag (Tage)
            <input
              type="number"
              min={0}
              max={60}
              value={config.selfCorrectionMaxDays ?? 3}
              onChange={(e) => setConfig({ ...config, selfCorrectionMaxDays: Number(e.target.value) })}
            />
          </label>
          <label>
            Genehmigung bei Arbeit ueber 0:00 erforderlich
            <select value={String(config.requireApprovalForCrossMidnight ?? true)} onChange={(e) => setConfig({ ...config, requireApprovalForCrossMidnight: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Grund beim Web-Kommen/Gehen
            <select value={String(config.requireReasonWebClock ?? true)} onChange={(e) => setConfig({ ...config, requireReasonWebClock: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Notiz beim eigenen Nachtrag
            <select value={String(config.requireNoteSelfCorrection ?? true)} onChange={(e) => setConfig({ ...config, requireNoteSelfCorrection: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Notiz bei Korrektur durch Vorgesetzten/Admin
            <select value={String(config.requireNoteSupervisorCorrection ?? true)} onChange={(e) => setConfig({ ...config, requireNoteSupervisorCorrection: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Notiz beim Antrag Urlaub/Ueberstunden
            <select value={String(config.requireNoteLeaveRequest ?? true)} onChange={(e) => setConfig({ ...config, requireNoteLeaveRequest: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Entscheidungsnotiz bei Antrag
            <select value={String(config.requireNoteLeaveDecision ?? true)} onChange={(e) => setConfig({ ...config, requireNoteLeaveDecision: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Aenderungsnotiz bei Antrag-Korrektur
            <select value={String(config.requireNoteLeaveSupervisorUpdate ?? true)} onChange={(e) => setConfig({ ...config, requireNoteLeaveSupervisorUpdate: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Notiz bei Ueberstunden-Aenderung
            <select value={String(config.requireNoteOvertimeAdjustment ?? true)} onChange={(e) => setConfig({ ...config, requireNoteOvertimeAdjustment: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mussfeld: Notiz bei Ueberstundenkonto setzen
            <select value={String(config.requireNoteOvertimeAccountSet ?? true)} onChange={(e) => setConfig({ ...config, requireNoteOvertimeAccountSet: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <div style={{ gridColumn: "1 / -1" }}>
            <label>
              Arbeitstage
              <div className="row">
                {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => {
                  const set = new Set((config.defaultWeeklyWorkingDays || "MON,TUE,WED,THU,FRI").split(",").filter(Boolean));
                  const active = set.has(d);
                  return (
                    <button
                      type="button"
                      key={d}
                      className={active ? "" : "secondary"}
                      onClick={() => {
                        if (active) set.delete(d); else set.add(d);
                        setConfig({ ...config, defaultWeeklyWorkingDays: Array.from(set).join(",") });
                      }}
                    >
                      {d}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>
        </div>
      )}

      {section === "colors" && (
        <div className="grid admin-section">
          {COLOR_FIELDS.map((field) => (
            <div key={field.key} className="row" style={{ justifyContent: "space-between" }}>
              <span
                style={{
                  background: (config[field.key] as string) || "#000000",
                  color: "#111827",
                  borderRadius: 8,
                  padding: "8px 10px",
                  minWidth: 280,
                  fontWeight: 600
                }}
              >
                {field.label}
              </span>
              <input
                type="color"
                value={(config[field.key] as string) || "#000000"}
                onChange={(e) => {
                  const updated = { ...config, [field.key]: e.target.value } as AdminConfig;
                  setConfig(updated);
                  applyTheme(updated as PublicConfig);
                }}
                style={{ width: 72, height: 42, padding: 4 }}
              />
            </div>
          ))}
        </div>
      )}

      {section === "mail" && (
        <div className="grid admin-section">
          <label>
            SMTP aktiviert
            <select value={String(config.smtpEnabled ?? false)} onChange={(e) => setConfig({ ...config, smtpEnabled: e.target.value === "true" })}>
              <option value="true">Ja</option>
              <option value="false">Nein</option>
            </select>
          </label>
          <label>
            SMTP Host
            <input value={config.smtpHost ?? ""} onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })} />
          </label>
          <label>
            SMTP Port
            <input type="number" value={config.smtpPort ?? 587} onChange={(e) => setConfig({ ...config, smtpPort: Number(e.target.value) })} />
          </label>
          <label>
            Benutzername
            <input value={config.smtpUser ?? ""} onChange={(e) => setConfig({ ...config, smtpUser: e.target.value })} />
          </label>
          <label>
            Passwort
            <input type="password" value={config.smtpPassword ?? ""} onChange={(e) => setConfig({ ...config, smtpPassword: e.target.value })} />
          </label>
          <label>
            Absenderadresse
            <input value={config.smtpFrom ?? ""} onChange={(e) => setConfig({ ...config, smtpFrom: e.target.value })} />
          </label>
          <label>
            Absendername
            <input value={config.smtpSenderName ?? ""} onChange={(e) => setConfig({ ...config, smtpSenderName: e.target.value })} />
          </label>
          <label>
            Buchhalter-Mail aktiv
            <select value={String(config.accountantMailEnabled ?? false)} onChange={(e) => setConfig({ ...config, accountantMailEnabled: e.target.value === "true" })}>
              <option value="true">Ja</option>
              <option value="false">Nein</option>
            </select>
          </label>
          <label>
            Buchhalter E-Mail
            <input value={config.accountantEmail ?? ""} onChange={(e) => setConfig({ ...config, accountantEmail: e.target.value })} />
          </label>
          <div className="row" style={{ gridColumn: "1 / -1" }}>
            <button
              className="secondary"
              type="button"
              onClick={async () => {
                try {
                  await api.testMailSender();
                  setMsg("SMTP Testmail an Absender wurde versendet.");
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              SMTP testen (Absender)
            </button>
            <button
              className="secondary"
              type="button"
              onClick={async () => {
                try {
                  await api.testMailAccountant();
                  setMsg("Testmail an Buchhalter wurde versendet.");
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              Buchhalter Testmail
            </button>
          </div>
          <label>
            Mail Mitarbeiter: Antrag Urlaub genehmigt/abgelehnt
            <select value={String(config.mailOnEmployeeLeaveDecision ?? true)} onChange={(e) => setConfig({ ...config, mailOnEmployeeLeaveDecision: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Mitarbeiter: Antrag Ueberstunden genehmigt/abgelehnt
            <select value={String(config.mailOnEmployeeOvertimeDecision ?? true)} onChange={(e) => setConfig({ ...config, mailOnEmployeeOvertimeDecision: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Mitarbeiter: Schicht ueber X Stunden
            <select value={String(config.mailOnEmployeeLongShift ?? false)} onChange={(e) => setConfig({ ...config, mailOnEmployeeLongShift: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Vorgesetzte: neuer Urlaubsantrag
            <select value={String(config.mailOnSupervisorLeaveRequest ?? true)} onChange={(e) => setConfig({ ...config, mailOnSupervisorLeaveRequest: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Vorgesetzte: neuer Ueberstundenantrag
            <select value={String(config.mailOnSupervisorOvertimeRequest ?? true)} onChange={(e) => setConfig({ ...config, mailOnSupervisorOvertimeRequest: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Vorgesetzte: Genehmigung Arbeit ueber 0:00
            <select value={String(config.mailOnSupervisorCrossMidnight ?? true)} onChange={(e) => setConfig({ ...config, mailOnSupervisorCrossMidnight: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Vorgesetzte: unbekannte RFID
            <select value={String(config.mailOnSupervisorUnknownRfid ?? true)} onChange={(e) => setConfig({ ...config, mailOnSupervisorUnknownRfid: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Admin: unbekannte RFID
            <select value={String(config.mailOnAdminUnknownRfid ?? true)} onChange={(e) => setConfig({ ...config, mailOnAdminUnknownRfid: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
          <label>
            Mail Admin: Systemfehler
            <select value={String(config.mailOnAdminSystemError ?? true)} onChange={(e) => setConfig({ ...config, mailOnAdminSystemError: e.target.value === "true" })}>
              <option value="true">Aktiv</option>
              <option value="false">Deaktiviert</option>
            </select>
          </label>
        </div>
      )}

      {section === "overtime" && (
        <div className="card admin-section-card" style={{ padding: 12 }}>
          <h4>Ueberstunden bearbeiten</h4>
          <div className="grid grid-2">
            <label>
              Mitarbeiter
              <select value={otUserId} onChange={(e) => setOtUserId(e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.loginName})</option>
                ))}
              </select>
            </label>
            <label>
              Ueberstundenkonto aktuell
              <input type="number" value={otCurrentHours} readOnly />
            </label>
            <label>
              Neuer Kontostand (Sollwert)
              <input type="number" min={-10000} max={10000} step="0.25" value={otTargetHours} onChange={(e) => setOtTargetHours(Number(e.target.value))} />
            </label>
            <label>
              Notiz (Pflicht)
              <textarea value={otNote} onChange={(e) => setOtNote(e.target.value)} />
            </label>
          </div>
          <button
            style={{ marginTop: 8 }}
            onClick={async () => {
              try {
                if (!otUserId) {
                  setMsg("Bitte Mitarbeiter auswaehlen.");
                  return;
                }
                if (!Number.isFinite(otTargetHours)) {
                  setMsg("Stunden sind ungueltig.");
                  return;
                }
                if (otTargetHours < -10000 || otTargetHours > 10000) {
                  setMsg("Stunden muessen zwischen -10000 und 10000 liegen.");
                  return;
                }
                if (!otNote.trim()) {
                  setMsg("Notiz ist Pflicht.");
                  return;
                }
                const result = await api.setOvertimeAccount(otUserId, { hours: otTargetHours, note: otNote.trim() });
                setMsg(`Ueberstundenkonto gespeichert (Delta ${result.delta >= 0 ? "+" : ""}${result.delta.toFixed(2)} h).`);
                setOtNote("");
                const [history, account] = await Promise.all([api.overtimeAdjustments(otUserId), api.overtimeAccount(otUserId)]);
                setOtHistory(history);
                setOtCurrentHours(account.overtimeBalanceHours);
                setOtTargetHours(account.overtimeBalanceHours);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Ueberstunden speichern
          </button>
          <div className="admin-table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr><th>Datum</th><th>Stunden</th><th>Notiz</th></tr>
              </thead>
              <tbody>
                {otHistory.map((h) => (
                  <tr key={h.id}>
                    <td>{h.date.slice(0, 10)}</td>
                    <td>{h.hours.toFixed(2)}</td>
                    <td>{h.reason}</td>
                  </tr>
                ))}
                {otHistory.length === 0 && <tr><td colSpan={3}>Keine Eintraege.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "bulk" && (
        <div className="card admin-section-card" style={{ padding: 12 }}>
          <h4>Stapelerfassung</h4>
          <div className="grid">
            <label>
              Mitarbeiter
              <select value={bulkUserId} onChange={(e) => setBulkUserId(e.target.value)}>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.loginName})</option>
                ))}
              </select>
            </label>
            <label>
              Anfangsdatum
              <input type="date" value={bulkStartDate} onChange={(e) => setBulkStartDate(e.target.value)} />
            </label>
            <label>
              Enddatum
              <input type="date" value={bulkEndDate} onChange={(e) => setBulkEndDate(e.target.value)} />
            </label>
            <label>
              Kommen
              <input type="time" step={60} value={bulkClockIn} onChange={(e) => setBulkClockIn(e.target.value.slice(0, 5))} />
            </label>
            <label>
              Gehen
              <input type="time" step={60} value={bulkClockOut} onChange={(e) => setBulkClockOut(e.target.value.slice(0, 5))} />
            </label>
            <label>
              Notiz (Pflicht)
              <textarea value={bulkNote} onChange={(e) => setBulkNote(e.target.value)} />
            </label>
          </div>
          <button
            style={{ marginTop: 8 }}
            onClick={async () => {
              try {
                if (!bulkUserId || !bulkStartDate || !bulkEndDate || !bulkClockIn || !bulkClockOut || !bulkNote.trim()) {
                  setMsg("Bitte alle Felder ausfuellen.");
                  return;
                }
                const [inH, inM] = bulkClockIn.split(":").map(Number);
                const [outH, outM] = bulkClockOut.split(":").map(Number);
                const gross = ((outH * 60 + outM) - (inH * 60 + inM)) / 60;
                if (!Number.isFinite(gross) || gross <= 0) {
                  setMsg("Uhrzeiten sind ungueltig.");
                  return;
                }
                const ok = window.confirm(`Bitte bestaetigen:\nZeitraum: ${bulkStartDate} bis ${bulkEndDate}\nUhrzeit: ${bulkClockIn} bis ${bulkClockOut}\nStunden/Tag: ${gross.toFixed(2)} h\n\nEs werden nur Arbeitstage ohne Feiertage/Wochenenden eingetragen.`);
                if (!ok) return;
                const result = await api.bulkEntry({
                  userId: bulkUserId,
                  startDate: bulkStartDate,
                  endDate: bulkEndDate,
                  clockIn: bulkClockIn,
                  clockOut: bulkClockOut,
                  note: bulkNote.trim()
                });
                setMsg(`Stapelerfassung gespeichert. Eingetragen: ${result.insertedDays} Tage, uebersprungen: ${result.skippedDays} Tage.`);
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Stapelerfassung ausfuehren
          </button>
        </div>
      )}

      {section === "logs" && (
        <div className="admin-section admin-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Zeit</th>
                <th>Loginname</th>
                <th>Aktion</th>
                <th>Ziel</th>
                <th>Daten</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.createdAt).toLocaleString("de-DE")}</td>
                  <td>{l.actorLoginName}</td>
                  <td>{l.action}</td>
                  <td>{l.targetType || "-"}</td>
                  <td style={{ maxWidth: 340, wordBreak: "break-word" }}>{l.payloadJson || "-"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5}>Keine Logeintraege.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {section === "employees" && (
        <div className="grid admin-section">
          <div className="card admin-section-card" style={{ padding: 12 }}>
            <h4>Neuen Mitarbeiter anlegen</h4>
            <div className="grid">
              <input placeholder="Name" value={newEmployee.name} onChange={(e) => setNewEmployee({ ...newEmployee, name: e.target.value })} />
              <input placeholder="E-Mail" value={newEmployee.email} onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })} />
              <input placeholder="Loginname" value={newEmployee.loginName} onChange={(e) => setNewEmployee({ ...newEmployee, loginName: e.target.value })} />
              <input placeholder="Passwort" type="password" value={newEmployee.password} onChange={(e) => setNewEmployee({ ...newEmployee, password: e.target.value })} />
              <label>
                Rolle
                <select value={newEmployee.role} onChange={(e) => setNewEmployee({ ...newEmployee, role: e.target.value as "EMPLOYEE" | "SUPERVISOR" | "ADMIN" })}>
                  <option value="EMPLOYEE">Mitarbeiter</option>
                  {session?.user.role === "ADMIN" && <option value="SUPERVISOR">Vorgesetzter</option>}
                  {session?.user.role === "ADMIN" && <option value="ADMIN">Admin</option>}
                </select>
              </label>
              <label>
                Mailbenachrichtigung
                <select
                  value={newEmployee.mailNotificationsEnabled ? "yes" : "no"}
                  onChange={(e) => setNewEmployee({ ...newEmployee, mailNotificationsEnabled: e.target.value === "yes" })}
                >
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              <label>
                Jahresurlaub (Tage)
                <input
                  type="number"
                  value={newEmployee.annualVacationDays}
                  onChange={(e) => setNewEmployee({ ...newEmployee, annualVacationDays: Number(e.target.value) })}
                />
              </label>
              <label>
                Sollarbeitszeit/Tag (h)
                <input type="number" step="0.25" value={newEmployee.dailyWorkHours} onChange={(e) => setNewEmployee({ ...newEmployee, dailyWorkHours: Number(e.target.value) })} />
              </label>
              <label>
                Resturlaub Vorjahr (Tage)
                <input
                  type="number"
                  value={newEmployee.carryOverVacationDays}
                  onChange={(e) => setNewEmployee({ ...newEmployee, carryOverVacationDays: Number(e.target.value) })}
                />
              </label>
              <label>
                Weblogin aktiviert
                <select value={newEmployee.webLoginEnabled ? "yes" : "no"} onChange={(e) => setNewEmployee({ ...newEmployee, webLoginEnabled: e.target.value === "yes" })}>
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              <label>
                RFID Tag
                <input value={newEmployee.rfidTag} onChange={(e) => setNewEmployee({ ...newEmployee, rfidTag: e.target.value })} />
              </label>
            </div>
            <button
              style={{ marginTop: 8 }}
              onClick={async () => {
                try {
                  await api.createEmployee({
                    ...newEmployee,
                    rfidTag: newEmployee.rfidTag.trim() ? newEmployee.rfidTag.trim() : undefined
                  });
                  setMsg("Mitarbeiter angelegt.");
                  setEmployees((await api.employees()) as Employee[]);
                  setNewEmployee({
                    name: "",
                    email: "",
                    loginName: "",
                    password: "",
                    role: "EMPLOYEE",
                    annualVacationDays: 30,
                    dailyWorkHours: 8,
                    carryOverVacationDays: 0,
                    mailNotificationsEnabled: true,
                    webLoginEnabled: true,
                    rfidTag: ""
                  });
                } catch (e) {
                  setMsg((e as Error).message);
                }
              }}
            >
              Mitarbeiter speichern
            </button>
          </div>

          <div className="card admin-section-card admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Login</th>
                  <th>E-Mail</th>
                  <th>Rolle</th>
                  <th>Jahresurlaub</th>
                  <th>Resturlaub</th>
                  <th>Soll/Tag</th>
                  <th>RFID</th>
                  <th>Mailversand</th>
                  <th>Weblogin</th>
                  <th>Zeiterfassung</th>
                  <th>Aktiv</th>
                  <th>Aktion</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => {
                const editing = editingEmployeeId === e.id;
                return (
                  <tr key={e.id}>
                    <td>{editing ? <input value={editingEmployee.name ?? e.name} onChange={(ev) => setEditingEmployee({ ...editingEmployee, name: ev.target.value })} /> : e.name}</td>
                    <td>{e.loginName}</td>
                    <td>{editing ? <input value={editingEmployee.email ?? e.email} onChange={(ev) => setEditingEmployee({ ...editingEmployee, email: ev.target.value })} /> : e.email}</td>
                    <td>
                      {editing ? (
                        <select value={(editingEmployee.role ?? e.role) as string} onChange={(ev) => setEditingEmployee({ ...editingEmployee, role: ev.target.value as Employee["role"] })}>
                          <option value="EMPLOYEE">Mitarbeiter</option>
                          {session?.user.role !== "ADMIN" && (editingEmployee.role ?? e.role) === "SUPERVISOR" && <option value="SUPERVISOR">Vorgesetzter</option>}
                          {session?.user.role !== "ADMIN" && (editingEmployee.role ?? e.role) === "ADMIN" && <option value="ADMIN">Admin</option>}
                          {session?.user.role === "ADMIN" && <option value="SUPERVISOR">Vorgesetzter</option>}
                          {session?.user.role === "ADMIN" && <option value="ADMIN">Admin</option>}
                        </select>
                      ) : (
                        e.role
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={editingEmployee.annualVacationDays ?? e.annualVacationDays}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, annualVacationDays: Number(ev.target.value) })}
                        />
                      ) : (
                        e.annualVacationDays
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          value={editingEmployee.carryOverVacationDays ?? e.carryOverVacationDays}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, carryOverVacationDays: Number(ev.target.value) })}
                        />
                      ) : (
                        e.carryOverVacationDays
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          step="0.25"
                          value={editingEmployee.dailyWorkHours ?? e.dailyWorkHours ?? 8}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, dailyWorkHours: Number(ev.target.value) })}
                        />
                      ) : (
                        (e.dailyWorkHours ?? 8).toFixed(2)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          value={editingEmployee.rfidTag ?? e.rfidTag ?? ""}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, rfidTag: ev.target.value })}
                        />
                      ) : (
                        e.rfidTag || "-"
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.mailNotificationsEnabled ?? e.mailNotificationsEnabled)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, mailNotificationsEnabled: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.mailNotificationsEnabled ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.webLoginEnabled ?? e.webLoginEnabled)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, webLoginEnabled: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.webLoginEnabled ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.timeTrackingEnabled ?? e.timeTrackingEnabled)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, timeTrackingEnabled: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.timeTrackingEnabled ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={String(editingEmployee.isActive ?? e.isActive)}
                          onChange={(ev) => setEditingEmployee({ ...editingEmployee, isActive: ev.target.value === "true" })}
                        >
                          <option value="true">Ja</option>
                          <option value="false">Nein</option>
                        </select>
                      ) : e.isActive ? "Ja" : "Nein"}
                    </td>
                    <td>
                      {!editing && (
                        <div className="row">
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditingEmployeeId(e.id);
                              setEditingEmployee({
                                name: e.name,
                                email: e.email,
                                role: e.role,
                                annualVacationDays: e.annualVacationDays,
                                dailyWorkHours: e.dailyWorkHours,
                                carryOverVacationDays: e.carryOverVacationDays,
                                isActive: e.isActive,
                                mailNotificationsEnabled: e.mailNotificationsEnabled,
                                webLoginEnabled: e.webLoginEnabled,
                                timeTrackingEnabled: e.timeTrackingEnabled,
                                rfidTag: e.rfidTag
                              });
                            }}
                          >
                            Bearbeiten
                          </button>
                          <button
                            className="secondary"
                            onClick={async () => {
                              try {
                                await api.testMailEmployee(e.id);
                                setMsg(`Testmail an ${e.name} wurde versendet.`);
                              } catch (err) {
                                setMsg((err as Error).message);
                              }
                            }}
                          >
                            TestMail
                          </button>
                        </div>
                      )}
                      {editing && (
                        <div className="row">
                          <button
                            onClick={async () => {
                              try {
                                await api.updateEmployee(e.id, {
                                  ...editingEmployee,
                                  rfidTag: typeof editingEmployee.rfidTag === "string" && editingEmployee.rfidTag.trim() === "" ? null : editingEmployee.rfidTag
                                });
                                setMsg("Mitarbeiter aktualisiert.");
                                setEditingEmployeeId(null);
                                setEditingEmployee({});
                                setEmployees((await api.employees()) as Employee[]);
                              } catch (err) {
                                setMsg((err as Error).message);
                              }
                            }}
                          >
                            Speichern
                          </button>
                          <button
                            className="secondary"
                            onClick={() => {
                              setEditingEmployeeId(null);
                              setEditingEmployee({});
                            }}
                          >
                            Abbrechen
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "terminals" && (
        <div className="admin-section">
          <div className="card admin-section-card" style={{ padding: 12, marginBottom: 12 }}>
            <h4>RFID Chip auslesen und zuweisen</h4>
            <div className="grid">
              <label>
                Erkannter RFID Tag
                <input
                  placeholder="RFID Tag"
                  value={assignRfidTag}
                  onChange={(e) => setAssignRfidTag(e.target.value)}
                />
              </label>
              <label>
                Mitarbeiter
                <select value={assignRfidUserId} onChange={(e) => setAssignRfidUserId(e.target.value)}>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.name} ({e.loginName})</option>
                  ))}
                </select>
              </label>
              <label>
                Notiz (optional)
                <input
                  placeholder="z.B. Neuer Chip zugewiesen"
                  value={assignRfidNote}
                  onChange={(e) => setAssignRfidNote(e.target.value)}
                />
              </label>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button
                onClick={async () => {
                  try {
                    if (!assignRfidTag.trim()) {
                      setMsg("Bitte zuerst einen RFID Tag auswaehlen oder eingeben.");
                      return;
                    }
                    if (!assignRfidUserId) {
                      setMsg("Bitte Mitarbeiter auswaehlen.");
                      return;
                    }
                    await api.assignRfidTag({
                      userId: assignRfidUserId,
                      rfidTag: assignRfidTag.trim(),
                      note: assignRfidNote.trim() || undefined
                    });
                    setMsg("RFID Tag zugewiesen.");
                    setAssignRfidNote("");
                    const [emps, scans] = await Promise.all([api.employees(), api.listUnassignedRfidScans()]);
                    setEmployees(emps as Employee[]);
                    setUnassignedRfid(scans);
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                RFID zuweisen
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    setUnassignedRfid(await api.listUnassignedRfidScans());
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                Liste aktualisieren
              </button>
            </div>

            <div className="admin-table-wrap" style={{ marginTop: 10 }}>
              <table>
                <thead>
                  <tr>
                    <th>RFID Tag</th>
                    <th>Zuletzt erkannt</th>
                    <th>Terminal</th>
                    <th>Anzahl</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {unassignedRfid.map((s) => (
                    <tr key={s.rfidTag}>
                      <td><code>{s.rfidTag}</code></td>
                      <td>{new Date(s.lastSeenAt).toLocaleString("de-DE")}</td>
                      <td>{s.terminalName || "-"}</td>
                      <td>{s.seenCount}</td>
                      <td>
                        <button
                          className="secondary"
                          onClick={() => setAssignRfidTag(s.rfidTag)}
                        >
                          Uebernehmen
                        </button>
                      </td>
                    </tr>
                  ))}
                  {unassignedRfid.length === 0 && (
                    <tr>
                      <td colSpan={5}>Keine unbekannten RFID-Scans vorhanden.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-2" style={{ marginBottom: 10 }}>
            <input value={terminalName} onChange={(e) => setTerminalName(e.target.value)} placeholder="Terminalname" />
            <input value={terminalLocation} onChange={(e) => setTerminalLocation(e.target.value)} placeholder="Standort (optional)" />
          </div>
          <button
            onClick={async () => {
              try {
                await api.createTerminal({ name: terminalName, location: terminalLocation || undefined });
                setTerminalName("");
                setTerminalLocation("");
                setMsg("Terminal erstellt.");
                setTerminals(await api.listTerminals());
              } catch (e) {
                setMsg((e as Error).message);
              }
            }}
          >
            Terminal hinzufuegen
          </button>

          <div className="grid" style={{ marginTop: 12 }}>
            {terminals.map((t) => (
              <div className="card admin-section-card" key={t.id} style={{ padding: 12 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{t.name}</strong>
                  <span>{t.isActive ? "Aktiv" : "Deaktiviert"}</span>
                </div>
                <div>Standort: {t.location || "-"}</div>
                <div>
                  API Key: <code>{t.apiKey}</code>
                </div>
                <div>Letzte Aktivitaet: {t.lastSeenAt ? t.lastSeenAt.slice(0, 19).replace("T", " ") : "-"}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button
                    className="secondary"
                    onClick={async () => {
                      try {
                        await api.updateTerminal(t.id, { isActive: !t.isActive });
                        setTerminals(await api.listTerminals());
                      } catch (e) {
                        setMsg((e as Error).message);
                      }
                    }}
                  >
                    {t.isActive ? "Deaktivieren" : "Aktivieren"}
                  </button>
                  <button
                    className="warn"
                    onClick={async () => {
                      try {
                        await api.regenerateTerminalKey(t.id);
                        setMsg("Terminal-Key neu erzeugt.");
                        setTerminals(await api.listTerminals());
                      } catch (e) {
                        setMsg((e as Error).message);
                      }
                    }}
                  >
                    Key neu erzeugen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === "esp" && (
        <div className="admin-section">
          <div className="card admin-section-card" style={{ padding: 12 }}>
            <h4>ESP32 Konfiguration erstellen</h4>
            <div className="grid">
              <label>
                RFID-Terminal
                <select value={espTerminalId} onChange={(e) => setEspTerminalId(e.target.value)}>
                  {terminals.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.location || "ohne Standort"})</option>
                  ))}
                </select>
              </label>
              <label>
                WLAN SSID
                <input value={espWifiSsid} onChange={(e) => setEspWifiSsid(e.target.value)} />
              </label>
              <label>
                WLAN Passwort
                <input type="password" value={espWifiPassword} onChange={(e) => setEspWifiPassword(e.target.value)} />
              </label>
              <label>
                Server IP / DynDNS
                <input placeholder="z.B. zeit.example.de oder 192.168.178.10" value={espServerHost} onChange={(e) => setEspServerHost(e.target.value)} />
              </label>
              <label>
                Server Port
                <input type="number" min={1} max={65535} value={espServerPort} onChange={(e) => setEspServerPort(Number(e.target.value))} />
              </label>
              <label>
                HTTPS verwenden
                <select value={espUseTls ? "yes" : "no"} onChange={(e) => setEspUseTls(e.target.value === "yes")}>
                  <option value="no">Nein (http)</option>
                  <option value="yes">Ja (https)</option>
                </select>
              </label>
              <label>
                RFID/NFC Modul
                <select value={espReaderType} onChange={(e) => {
                  const rt = e.target.value as "RC522" | "PN532";
                  setEspReaderType(rt);
                  if (rt === "RC522") {
                    setEspPins({ sck: 18, miso: 19, mosi: 23, ss: 27, rst: 26 });
                  } else {
                    setEspPins({ sda: 21, scl: 22, irq: 4, rst: 16 });
                  }
                }}>
                  <option value="RC522">RC522 (SPI)</option>
                  <option value="PN532">PN532 / NFC Module V3</option>
                </select>
              </label>
              {espReaderType === "PN532" && (
                <label>
                  PN532 Modus
                  <select value={espPn532Mode} onChange={(e) => setEspPn532Mode(e.target.value as "I2C" | "SPI")}>
                    <option value="I2C">I2C</option>
                    <option value="SPI">SPI</option>
                  </select>
                </label>
              )}
              <label>
                LCD aktiviert
                <select value={espDisplayEnabled ? "yes" : "no"} onChange={(e) => setEspDisplayEnabled(e.target.value === "yes")}>
                  <option value="yes">Ja</option>
                  <option value="no">Nein</option>
                </select>
              </label>
              {espDisplayEnabled && (
                <>
                  <label>
                    LCD Zeilen
                    <input type="number" min={1} max={8} value={espDisplayRows} onChange={(e) => setEspDisplayRows(Number(e.target.value))} />
                  </label>
                </>
              )}
            </div>

            <h4 style={{ marginTop: 12 }}>Pinbelegung</h4>
            <div className="admin-table-wrap">
              <table>
                <thead>
                  <tr><th>Signal</th><th>GPIO</th><th>Hinweis</th></tr>
                </thead>
                <tbody>
                  {espDisplayEnabled && (
                    <>
                      <tr><td>LCD SDA</td><td><input type="number" value={espDisplaySda} onChange={(e) => setEspDisplaySda(Number(e.target.value))} /></td><td>I2C Datenleitung Display</td></tr>
                      <tr><td>LCD SCL</td><td><input type="number" value={espDisplayScl} onChange={(e) => setEspDisplayScl(Number(e.target.value))} /></td><td>I2C Taktleitung Display</td></tr>
                      <tr><td>LCD Adresse</td><td><input value={espDisplayAddress} onChange={(e) => setEspDisplayAddress(e.target.value)} /></td><td>Typisch 0x27 oder 0x3F</td></tr>
                    </>
                  )}
                  {espReaderType === "RC522" && (
                    <>
                      <tr><td>SCK</td><td><input type="number" value={espPins.sck ?? 18} onChange={(e) => setEspPins({ ...espPins, sck: Number(e.target.value) })} /></td><td>SPI Clock</td></tr>
                      <tr><td>MISO</td><td><input type="number" value={espPins.miso ?? 19} onChange={(e) => setEspPins({ ...espPins, miso: Number(e.target.value) })} /></td><td>SPI MISO</td></tr>
                      <tr><td>MOSI</td><td><input type="number" value={espPins.mosi ?? 23} onChange={(e) => setEspPins({ ...espPins, mosi: Number(e.target.value) })} /></td><td>SPI MOSI</td></tr>
                      <tr><td>SS(SDA)</td><td><input type="number" value={espPins.ss ?? 27} onChange={(e) => setEspPins({ ...espPins, ss: Number(e.target.value) })} /></td><td>Chip Select</td></tr>
                      <tr><td>RST</td><td><input type="number" value={espPins.rst ?? 26} onChange={(e) => setEspPins({ ...espPins, rst: Number(e.target.value) })} /></td><td>Reset</td></tr>
                    </>
                  )}
                  {espReaderType === "PN532" && espPn532Mode === "I2C" && (
                    <>
                      <tr><td>SDA</td><td><input type="number" value={espPins.sda ?? 21} onChange={(e) => setEspPins({ ...espPins, sda: Number(e.target.value) })} /></td><td>I2C Data</td></tr>
                      <tr><td>SCL</td><td><input type="number" value={espPins.scl ?? 22} onChange={(e) => setEspPins({ ...espPins, scl: Number(e.target.value) })} /></td><td>I2C Clock</td></tr>
                      <tr><td>IRQ</td><td><input type="number" value={espPins.irq ?? 4} onChange={(e) => setEspPins({ ...espPins, irq: Number(e.target.value) })} /></td><td>Interrupt (optional)</td></tr>
                      <tr><td>RSTO</td><td><input type="number" value={espPins.rst ?? 16} onChange={(e) => setEspPins({ ...espPins, rst: Number(e.target.value) })} /></td><td>Reset (optional)</td></tr>
                    </>
                  )}
                  {espReaderType === "PN532" && espPn532Mode === "SPI" && (
                    <>
                      <tr><td>SCK</td><td><input type="number" value={espPins.sck ?? 18} onChange={(e) => setEspPins({ ...espPins, sck: Number(e.target.value) })} /></td><td>SPI Clock</td></tr>
                      <tr><td>MISO</td><td><input type="number" value={espPins.miso ?? 19} onChange={(e) => setEspPins({ ...espPins, miso: Number(e.target.value) })} /></td><td>SPI MISO</td></tr>
                      <tr><td>MOSI</td><td><input type="number" value={espPins.mosi ?? 23} onChange={(e) => setEspPins({ ...espPins, mosi: Number(e.target.value) })} /></td><td>SPI MOSI</td></tr>
                      <tr><td>SS</td><td><input type="number" value={espPins.ss ?? 5} onChange={(e) => setEspPins({ ...espPins, ss: Number(e.target.value) })} /></td><td>Chip Select</td></tr>
                      <tr><td>RSTO</td><td><input type="number" value={espPins.rst ?? 16} onChange={(e) => setEspPins({ ...espPins, rst: Number(e.target.value) })} /></td><td>Reset (optional)</td></tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ marginTop: 10, padding: 10 }}>
              <strong>Anzeigeverhalten (LCD)</strong>
              <div>Ruhezustand: Firmenname + Datum/Uhrzeit.</div>
              <div>Scan: Mitarbeitername + Kommen/Gehen + Uhrzeit.</div>
              <div>Bei Gehen: Tagesarbeitszeit (aufsummiert) anzeigen.</div>
            </div>

            <div className="row" style={{ marginTop: 10 }}>
              <button
                onClick={async () => {
                  try {
                    const configJson = await api.generateEspProvisionConfig({
                      terminalId: espTerminalId,
                      wifiSsid: espWifiSsid.trim(),
                      wifiPassword: espWifiPassword,
                      serverHost: espServerHost.trim(),
                      serverPort: Number(espServerPort),
                      useTls: espUseTls,
                      displayEnabled: espDisplayEnabled,
                      displayRows: Number(espDisplayRows),
                      displayPins: espDisplayEnabled ? {
                        sda: Number(espDisplaySda),
                        scl: Number(espDisplayScl),
                        address: espDisplayAddress.trim() || "0x27"
                      } : undefined,
                      readerType: espReaderType,
                      pn532Mode: espReaderType === "PN532" ? espPn532Mode : undefined,
                      pins: espPins
                    });
                    const pretty = JSON.stringify(configJson, null, 2);
                    setEspConfigPreview(pretty);
                    setMsg("ESP32 Konfiguration erstellt.");
                  } catch (e) {
                    setMsg((e as Error).message);
                  }
                }}
              >
                Konfiguration erzeugen
              </button>
              <button
                className="secondary"
                onClick={() => {
                  if (!espConfigPreview) {
                    setMsg("Bitte zuerst Konfiguration erzeugen.");
                    return;
                  }
                  const blob = new Blob([espConfigPreview], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "esp32-terminal-config.json";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                JSON herunterladen
              </button>
              <button
                className="secondary"
                onClick={() => {
                  try {
                    if (!espConfigPreview) {
                      setMsg("Bitte zuerst Konfiguration erzeugen.");
                      return;
                    }
                    const header = buildConfigLocalHeaderFromProvisionJson(espConfigPreview);
                    const blob = new Blob([header], { type: "text/plain" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "config_local.h";
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch {
                    setMsg("config_local.h konnte nicht erstellt werden.");
                  }
                }}
              >
                config_local.h herunterladen
              </button>
            </div>

            <label style={{ marginTop: 10 }}>
              JSON Vorschau
              <textarea
                value={espConfigPreview}
                readOnly
                style={{ minHeight: 240, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}
              />
            </label>
          </div>
        </div>
      )}

      <div className="row" style={{ marginTop: 12 }}>
        <button
          onClick={async () => {
            try {
              await api.updateConfig(config);
              setMsg("Gespeichert.");
              const pcfg = await api.publicConfig();
              applyTheme(pcfg);
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
        >
          Aenderungen speichern
        </button>
      </div>

      {msg && <div className="success" style={{ marginTop: 10 }}>{msg}</div>}
    </div>
  );
}

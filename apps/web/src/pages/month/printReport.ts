import type { MonthReport } from "../../api/client";

function esc(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtHours(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "";
  return `${value.toFixed(2)} h`;
}

function fmtPause(minutes: number | null): string {
  if (minutes === null || Number.isNaN(minutes)) return "";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function printMonthReport(report: MonthReport, w?: Window | null): void {
  const target = w || window.open("", "_blank");
  if (!target) throw new Error("Popup blockiert. Bitte Popups fuer diese Seite erlauben.");

  const logoUrl = report.companyLogoUrl
    ? (/^(https?:|data:)/i.test(report.companyLogoUrl) ? report.companyLogoUrl : `${window.location.origin}${report.companyLogoUrl.startsWith("/") ? "" : "/"}${report.companyLogoUrl}`)
    : "";
  const logo = logoUrl ? `<img src="${esc(logoUrl)}" alt="Logo" />` : "";
  const rowsHtml = report.rows.map((r) => {
    const rowClass = r.isContinuation ? "cont" : "";
    const worked = r.isDayTotalRow && r.workedHours !== null ? `${r.workedHours.toFixed(2)} h` : fmtHours(r.workedHours);
    return `<tr class="${rowClass}">
      <td>${esc(r.date || "")}</td>
      <td>${esc(r.clockIn || "")}</td>
      <td>${esc(r.clockOut || "")}</td>
      <td>${fmtHours(r.plannedHours)}</td>
      <td>${esc(worked)}</td>
      <td>${esc(fmtPause(r.pauseMinutes))}</td>
      <td>${esc(r.note || "")}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Stundenzettel ${esc(report.monthLabel)} - ${esc(report.employeeName)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: "Avenir Next", "Segoe UI", Arial, sans-serif; color: #111827; margin: 0; }
    .header { display: grid; grid-template-columns: 1fr auto; align-items: start; gap: 12px; margin-bottom: 12px; }
    .title h1 { margin: 0; font-size: 24px; }
    .title .meta { margin-top: 4px; font-size: 14px; color: #374151; }
    .logo img { max-height: 64px; max-width: 180px; object-fit: contain; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; }
    tr.cont td:first-child { background: #f8fafc; }
    tfoot td { font-weight: 700; background: #eef2ff; }
    .summary { margin-top: 12px; border: 1px solid #cbd5e1; padding: 10px; border-radius: 8px; font-size: 13px; display: grid; gap: 4px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">
      <h1>${esc(report.companyName)}</h1>
      <div class="meta">Mitarbeiter: <strong>${esc(report.employeeName)}</strong></div>
      <div class="meta">Monat: <strong>${esc(report.monthLabel)}</strong></div>
    </div>
    <div class="logo">${logo}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Datum</th>
        <th>Kommen</th>
        <th>Gehen</th>
        <th>Sollarbeitszeit</th>
        <th>IST Arbeitszeit</th>
        <th>Pause</th>
        <th>Notiz</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3">Monatssumme</td>
        <td>${esc(report.totals.plannedHours.toFixed(2))} h</td>
        <td>${esc(report.totals.workedHours.toFixed(2))} h</td>
        <td colspan="2"></td>
      </tr>
    </tfoot>
  </table>
  <div class="summary">
    <div>Verfuegbare Urlaubstage: <strong>${esc(report.vacation.availableDays.toFixed(2))}</strong></div>
    <div>Zukuenftig verplanter Urlaub: <strong>${esc(report.vacation.plannedFutureDays.toFixed(2))}</strong></div>
    <div>Ueberstunden Konto Monatsanfang: <strong>${esc(report.overtime.monthStartHours.toFixed(2))} h</strong></div>
    <div>Ueberstunden Konto Monatsende: <strong>${esc(report.overtime.monthEndHours.toFixed(2))} h</strong></div>
  </div>
</body>
</html>`;

  target.document.open();
  target.document.write(html);
  target.document.close();
  target.focus();
  setTimeout(() => target.print(), 250);
}

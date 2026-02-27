# Zeitmanagment

Komplettes Grundgeruest fuer ein Zeiterfassungssystem mit:
- Backend API (Node.js + TypeScript + Express + Prisma + MySQL)
- Frontend (React + Vite, responsive fuer Handy/Tablet/PC)
- Docker Compose (MySQL + API + Web)
- Synology Docker tauglich (einfach per `docker-compose.yml` deploybar)

## Bereits umgesetzt (Basis)

### Mitarbeiter
- Login mit Loginname + Passwort
- Passwort aendern
- Passwort zuruecksetzen (Basis-Endpunkt)
- Startbereich mit Stempeluhr, Urlaubsantrag, Stundenuebersicht
- Kommen/Gehen Stempeln ueber Web
- Grund/Kommentar fuer Web-Stempelung
- Monatsuebersicht: Sollstunden, geleistete Stunden, Ueberstunden
- Urlaubsantrag / Ueberstundenabbau beantragen
- Eigene Antraege mit Statusliste

### Vorgesetzte / Admin
- Mitarbeiterliste
- Urlaubsantraege genehmigen/ablehnen inkl. Notiz
- Mitarbeitende anlegen
- Mitarbeitende bearbeiten / ausblenden (`isActive`)
- Feiertage anlegen
- Dropdown-Werte pflegen
- Krankmeldung eintragen (von/bis, optional stundenweise)
- Admin-Konfiguration fuer Firma/System/Pausen/Farben
- RFID-Terminals anlegen, deaktivieren/aktivieren, Key neu erzeugen
- Port-Sollwerte (Web/API/Terminal) in Admin-Konfiguration pflegbar

### Verwaltung / Regeln (Basis)
- MySQL Datenbank
- 8h Standard-Arbeitstag (konfigurierbar)
- Automatischer Pausenabzug nach Schwellwert (konfigurierbar)
- Pausegutschrift als eigener Datentyp mit Pflichtbegruendung
- Nachtraegliche Zeiterfassung als Korrektur mit Pflichtkommentar
- Alert-Flag bei >12h am Stueck
- Rollenmodell: EMPLOYEE / SUPERVISOR / ADMIN
- Farben zentral in Systemkonfiguration

## Architektur

- `apps/api`: REST API, Auth, Business-Logik, Datenmodell
- `apps/web`: Web-UI
- `docker-compose.yml`: komplette Laufzeitumgebung

## Schnellstart lokal (ohne Docker)

1. `cp .env.example .env`
2. `npm install`
3. MySQL starten und in `.env` `DATABASE_URL` setzen (Beispiel):
   - `DATABASE_URL=mysql://zeit:change_me_user@localhost:3306/zeitmanagment`
4. DB Schema erstellen:
   - `npm run prisma:generate -w apps/api`
   - `npm run prisma:deploy -w apps/api` oder `npx prisma db push --schema apps/api/prisma/schema.prisma`
5. Seed ausfuehren:
   - `npm run prisma:seed -w apps/api`
6. API starten:
   - `npm run dev -w apps/api`
7. Web starten:
   - `npm run dev -w apps/web`

Beispiel-Logins nach Seed:
- Admin: `admin` / `Admin1234!`
- Mitarbeiter: `max` / `Mitarbeiter123!`

## Docker Start

1. `cp .env.example .env`
2. `.env` Werte anpassen (Passwoerter/JWT)
   - Wenn `3306` belegt ist: `MYSQL_PORT` auf freien Host-Port setzen (z.B. `3307`)
   - Optional Admin-Startdaten:
   - `ADMIN_LOGIN_NAME`
   - `ADMIN_PASSWORD`
   - `ADMIN_NAME`
   - `ADMIN_EMAIL`
3. Start:
   - `docker compose up --build -d`
4. Aufruf:
   - Web: `http://localhost:${WEB_PORT}`
   - API Health: `http://localhost:${API_PORT}/api/health`
   - Terminal API: `http://localhost:${TERMINAL_PORT}/api/terminal/punch`

Hinweis zu Ports:
- Die effektiven Docker-Ports kommen aus `.env` (`WEB_PORT`, `API_PORT`, `TERMINAL_PORT`, `MYSQL_PORT`).
- Die Portwerte im Admin-Webinterface sind Sollwerte in der Datenbank und aendern Docker nicht automatisch.
- Nach Port-Aenderungen in `.env`: `docker compose up -d --build` erneut ausfuehren.

Hinweis Admin-Bootstrap:
- Beim API-Start wird ein Admin aus den `.env`-Werten automatisch angelegt/aktualisiert.
- Aenderst du `ADMIN_LOGIN_NAME` oder `ADMIN_PASSWORD`, dann nach Rebuild/Restart mit den neuen Daten einloggen.
- Falls `ADMIN_*` leer sind, werden sichere Defaults verwendet (`admin` / `Admin1234!`).

## ESP32 Terminal (Arduino IDE)

- Sketch: `firmware/esp32_terminal/esp32_terminal.ino`
- Anleitung: `firmware/esp32_terminal/README.md`
- Konfig aus Webinterface:
  - `Admin > ESP32 Provisioning`
  - JSON herunterladen
  - als `config.json` ins ESP-Dateisystem (SPIFFS) laden

## Synology Docker

1. Repository auf NAS klonen oder Dateien hochladen
2. In Synology "Container Manager" ein Compose-Projekt mit `docker-compose.yml` erstellen
3. `.env` hinterlegen
4. Build + Start ausfuehren

## Wichtige API-Endpunkte (Auszug)

- `POST /api/auth/login`
- `POST /api/auth/change-password`
- `POST /api/auth/reset-password`
- `POST /api/time/clock`
- `POST /api/time/correction`
- `POST /api/time/break-credit`
- `GET /api/time/summary/:userId`
- `POST /api/leave`
- `GET /api/leave/my`
- `POST /api/leave/cancel`
- `GET /api/leave/pending`
- `POST /api/leave/decision`
- `GET /api/employees`
- `POST /api/employees`
- `PATCH /api/employees/:id`
- `GET /api/admin/config`
- `PATCH /api/admin/config`
- `POST /api/admin/holidays`
- `POST /api/admin/sick-leave`
- `GET /api/admin/terminals`
- `POST /api/admin/terminals`
- `PATCH /api/admin/terminals/:id`
- `POST /api/admin/terminals/:id/regenerate-key`
- `POST /api/terminal/punch`

## Mobile App (Android + iOS, native)

Es gibt jetzt ein eigenes Native-App-Projekt unter:
- `apps/mobile` (Expo / React Native, keine WebView-App)

### Zielbild der App
- Erststart nur per QR-Provisioning
- QR-Inhalt ist verschluesselt (API-URL + optional Loginname/Passwort)
- Provisioning ist nach Scan gesperrt und in der App nicht einsehbar/aenderbar
- Aenderung nur durch kompletten App-Reset und erneuten QR-Scan
- Rollenbasierte App-Navigation fuer `AZUBI`, `EMPLOYEE`, `SUPERVISOR`, `ADMIN`
- Startseite zeigt nur Kommen/Gehen, Nachtrag und bei `AZUBI` Berufsschule
- Weitere Funktionen ueber Bottom-Tabs

### Mobile Setup lokal
1. Abhaengigkeiten installieren:
   - `npm install`
2. Mobile App starten:
   - `npm run dev:mobile`
3. Android:
   - `npm run android -w apps/mobile`
4. iOS:
   - `npm run ios -w apps/mobile`

### QR-Code Inhalt erzeugen
Provisioning-String erzeugen:
- `npm run qr:encode -w apps/mobile -- --api https://deine-domain.tld --login max --password Mitarbeiter123!`

Der ausgegebene String wird als QR-Code codiert und in der App beim Erststart gescannt.

## Noch offen fuer die naechste Ausbaustufe

- PDF-Export im finalen Stundenzettel-Design
- SMTP-Mails bei Urlaubsantraegen und >12h Schicht final verdrahten
- Exakte Regelabbildung fuer Feiertag/Gehaltsempfaenger/Urlaub-First-Resturlaub
- Jahreswechsel-Automatisierung am 31.12 als geplanter Job
- Vollstaendige Mobile UX Feinarbeit und Formularvalidierung pro Feld
- Audit-Logging/Reporting

## GitHub veroeffentlichen

1. `git init`
2. `git add .`
3. `git commit -m "Initiales Zeitmanagment Grundgeruest"`
4. Neues GitHub-Repo erstellen
5. `git remote add origin <repo-url>`
6. `git push -u origin main`

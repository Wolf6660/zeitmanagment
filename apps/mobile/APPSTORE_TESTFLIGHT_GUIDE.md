# iOS TestFlight / App Store Guide (Beta)

## Technischer Stand im Projekt

- App-Name: `Zeitmanagment Beta`
- App-Version: `0.1.0`
- iOS BuildNumber: `1`
- Bundle Identifier: `de.zeitmanagment.mobile`
- Kamera-Permission-Text ist gesetzt (`NSCameraUsageDescription`)
- EAS Build/Submit Konfiguration ist vorhanden (`eas.json`)

## Vorbereiten

1. Apple Developer Account aktiv
2. App in App Store Connect anlegen (gleicher Bundle Identifier)
3. EAS CLI installieren und einloggen

```bash
npm i -g eas-cli
cd /Users/wolf/Documents/Zeitmanagment/apps/mobile
eas login
```

## Build und Upload

```bash
cd /Users/wolf/Documents/Zeitmanagment/apps/mobile
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Hinweis:
- In `eas.json` muss bei `submit.production.ios.ascAppId` die echte App-Store-Connect-App-ID eingetragen werden.

## Externe Tester (Freunde)

1. In App Store Connect -> TestFlight
2. Build auswaehlen
3. Test Information ausfuellen (Was testen? Wie einloggen?)
4. Externe Testergruppe anlegen und einladen

## Pflichtangaben fuer Review

- Privacy Policy URL
- Support URL / Kontakt
- Review-Notiz mit Testzugang (Loginname/Passwort oder Test-QR)
- Beschreibung der QR-Ersteinrichtung fuer Reviewer
- Export Compliance korrekt beantworten

## Beta-Versionierung (0.xxx)

- Die App ist auf `0.1.0` als Beta eingestellt.
- Fuer naechste Releases:
  - `version` in `app.json` erhoehen (z. B. `0.1.1`, `0.2.0`)
  - `buildNumber` wird via EAS (`autoIncrement`) bei Production-Builds hochgezaehlt.

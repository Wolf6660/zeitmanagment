# Zeitmanagment Mobile

Native Mobile-App fuer Android und iOS (Expo / React Native).

## Eigenschaften

- QR-basierte Ersteinrichtung (verschluesselt)
- Provisioning-Daten werden gesperrt gespeichert
- Keine Anzeige/Aenderung der API-Einstellungen in der App
- Rollenbasierte Tabs (Mitarbeiter/Azubi/Vorgesetzte/Admin)
- Startseite mit Kommen/Gehen, Nachtrag, Azubi-Berufsschule
- Vollstaendiger Reset erzwingt neuen QR-Scan

## Start

```bash
npm install
npm run start -w apps/mobile
```

## QR-Provisioning String erzeugen

```bash
npm run qr:encode -w apps/mobile -- --api https://deine-domain.tld --login max --password Mitarbeiter123!
```

Dann den ausgegebenen String in einen QR-Code umwandeln und in der App scannen.

## Hinweis zur Verschluesselung

Die QR-Nutzdaten werden clientseitig per AES verschluesselt/dechiffriert.
Der gemeinsame Secret-Key steht aktuell im Mobile-Code und im QR-Encoder-Skript.
Fuer hoehere Sicherheit sollte dieser Schluessel in einer separaten, nur intern verwalteten Build-Konfiguration liegen oder durch serverseitige One-Time-Provisioning-Tokens ersetzt werden.

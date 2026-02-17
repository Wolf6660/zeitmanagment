import React, { useMemo, useState } from "react";

type Guide = {
  id: string;
  title: string;
  intro: string;
  steps: string[];
  hints?: string[];
};

const GUIDES: Guide[] = [
  {
    id: "esp32-arduino",
    title: "ESP32 Terminal flashen (Arduino IDE)",
    intro: "Diese Anleitung beschreibt den kompletten Ablauf fuer ESP32-WROOM-32 mit RC522/PN532 und optional LCD2004.",
    steps: [
      "Im Webinterface unter Admin > ESP32 Provisioning alle Werte ausfuellen und JSON herunterladen.",
      "Die JSON-Datei in config.json umbenennen.",
      "In Arduino IDE die Datei firmware/esp32_terminal/esp32_terminal.ino ueber Datei > Oeffnen laden.",
      "ESP32 Boardpaket installieren: https://espressif.github.io/arduino-esp32/package_esp32_index.json eintragen und esp32 by Espressif Systems installieren.",
      "Bibliotheken installieren: ArduinoJson, MFRC522, Adafruit PN532, LiquidCrystal I2C (johnrickman).",
      "Board auf ESP32 Dev Module stellen und den richtigen COM/USB-Port waehlen.",
      "config.json in SPIFFS als /config.json hochladen (Dateisystem-Upload).",
      "Sketch auf den ESP32 hochladen und seriellen Monitor mit 115200 Baud oeffnen."
    ],
    hints: [
      "Wenn WiFi.h fehlt, ist das ESP32 Boardpaket nicht installiert.",
      "Wenn LiquidCrystal_I2C.h fehlt, Bibliothek LiquidCrystal_I2C von johnrickman installieren.",
      "Wenn PN532-I2C Probleme macht, im Provisioning den richtigen Modus (I2C/SPI) und Pins pruefen.",
      "Display-Ruhemodus zeigt Firmenname + Datum/Uhrzeit. Beim Gehen wird Tagesarbeitszeit angezeigt."
    ]
  },
  {
    id: "esp32-wiring",
    title: "Pinbelegung und Verdrahtung",
    intro: "Uebersicht fuer haeufige Standard-Pinbelegungen am ESP32-WROOM-32.",
    steps: [
      "RC522 (SPI): SCK=GPIO18, MISO=GPIO19, MOSI=GPIO23, SS=GPIO5, RST=GPIO22, 3.3V und GND.",
      "PN532 (I2C): SDA=GPIO21, SCL=GPIO22, optional IRQ=GPIO4, optional RST=GPIO16, 3.3V und GND.",
      "LCD2004 (I2C): SDA=GPIO21, SCL=GPIO22, Adresse meist 0x27 oder 0x3F, 5V und GND.",
      "Nie 5V-Logik direkt auf ESP32 GPIO geben, nur 3.3V-Logik an den Signalleitungen.",
      "Pins muessen mit dem Provisioning-JSON uebereinstimmen."
    ],
    hints: [
      "RC522 laeuft stabil mit kurzen SPI-Leitungen.",
      "Bei LCD ohne Anzeige zuerst I2C-Adresse pruefen (0x27/0x3F).",
      "PN532-Boards haben oft Schalter/Jumper fuer I2C/SPI/UART."
    ]
  },
  {
    id: "terminal-test",
    title: "RFID Terminal testen",
    intro: "So pruefst du die komplette Kette vom Scan bis zur Buchung.",
    steps: [
      "Im Adminbereich ein RFID-Terminal anlegen und Provisioning-Konfiguration erzeugen.",
      "Mit unbekanntem Chip scannen und in Admin > RFID-Terminals den Bereich RFID Chip auslesen und zuweisen oeffnen.",
      "Chip einem Mitarbeiter zuweisen.",
      "Erneut scannen und pruefen, ob Kommen/Gehen korrekt gebucht wird.",
      "Bei Gehen pruefen, ob die Tagesarbeitszeit aufsummiert im Display erscheint."
    ],
    hints: [
      "Bei HTTP-Fehlern Host/Port/TLS im JSON und API-Erreichbarkeit pruefen.",
      "Wenn kein Scan erkannt wird, Reader-Typ und Pinbelegung im Provisioning vergleichen."
    ]
  }
];

export function GuidesPage() {
  const [guideId, setGuideId] = useState(GUIDES[0].id);

  const guide = useMemo(() => GUIDES.find((g) => g.id === guideId) || GUIDES[0], [guideId]);

  return (
    <div className="card">
      <h2>Anleitungen</h2>
      <label>
        Anleitung auswaehlen
        <select value={guideId} onChange={(e) => setGuideId(e.target.value)}>
          {GUIDES.map((g) => (
            <option key={g.id} value={g.id}>{g.title}</option>
          ))}
        </select>
      </label>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>{guide.title}</h3>
        <p>{guide.intro}</p>
        <ol>
          {guide.steps.map((step, i) => (
            <li key={`${guide.id}-step-${i}`} style={{ marginBottom: 6 }}>{step}</li>
          ))}
        </ol>
        {guide.hints && guide.hints.length > 0 && (
          <>
            <h4>Wichtige Hinweise</h4>
            <ul>
              {guide.hints.map((h, i) => (
                <li key={`${guide.id}-hint-${i}`}>{h}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}


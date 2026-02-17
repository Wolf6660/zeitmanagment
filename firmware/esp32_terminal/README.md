# ESP32 RFID Terminal (Arduino IDE)

Dieses Projekt ist fuer `ESP32-WROOM-32` gedacht und nutzt die im Adminbereich erzeugte Datei `esp32-terminal-config.json`.

## 1) Voraussetzungen

- Arduino IDE mit ESP32 Board-Support
- Bibliotheken installieren:
  - `ArduinoJson`
  - `MFRC522`
  - `Adafruit PN532`
  - `LiquidCrystal I2C` (johnrickman): `https://github.com/johnrickman/LiquidCrystal_I2C`

## 2) Projekt oeffnen

1. Arduino IDE starten
2. `Datei > Oeffnen`
3. Datei auswaehlen:
   - `firmware/esp32_terminal/esp32_terminal.ino`

## 3) JSON auf den ESP laden

Die Firmware erwartet eine Datei im ESP-Dateisystem:
- Pfad auf ESP: `/config.json`

Vorgehen:
1. Im Adminbereich JSON erzeugen und herunterladen.
2. Datei umbenennen in `config.json`.
3. Dateisystem-Upload nutzen (SPIFFS/LittleFS Upload Tool in Arduino IDE).

Hinweis: Falls das Upload-Tool in deiner IDE fehlt, musst du das passende Dateisystem-Plugin fuer die Arduino IDE installieren.

## 4) Flashen

1. Board: passendes ESP32-Board waehlen (z. B. ESP32 Dev Module)
2. Port waehlen
3. Hochladen
4. Seriellen Monitor (115200) oeffnen

## 5) Verhalten am Display

- Ruhezustand: Firmenname + Datum/Uhrzeit
- Beim Scan: Name + Kommen/Gehen + Uhrzeit
- Beim Gehen: zusaetzlich Tagesarbeitszeit (aufsummiert)

## 6) Reader-Hinweise

- RC522: SPI
- PN532: I2C oder SPI (im JSON konfiguriert)
- LCD2004: I2C (SDA/SCL + Adresse, z. B. `0x27`)

## 7) Sicherheit

Die JSON enthaelt WLAN-Passwort und Terminal-Key. Datei nur intern nutzen und nicht oeffentlich teilen.

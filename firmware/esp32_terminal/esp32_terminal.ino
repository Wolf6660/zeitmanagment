#include <LiquidCrystal_I2C.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SPIFFS.h>
#include <SPI.h>
#include <Wire.h>
#include <ArduinoJson.h>
#include <MFRC522.h>
#include <Adafruit_PN532.h>
#include <time.h>

#define HAS_LCD_I2C 1

#if __has_include("config_local.h")
#include "config_local.h"
#define HAS_LOCAL_CONFIG 1
#else
#define HAS_LOCAL_CONFIG 0
#endif

#if HAS_LOCAL_CONFIG
#ifndef LOCAL_TIME_OFFSET_HOURS
#define LOCAL_TIME_OFFSET_HOURS 0
#endif
#endif

struct Config {
  String wifiSsid;
  String wifiPassword;
  String endpoint;
  bool useTls;
  String terminalKey;

  String readerType;    // RC522 / PN532
  String pn532Mode;     // I2C / SPI
  int sda = 21;
  int scl = 22;
  int mosi = 23;
  int miso = 19;
  int sck = 18;
  int ss = 27;
  int rst = 26;
  int irq = 4;

  bool displayEnabled = false;
  int displayRows = 4;
  int displaySda = 21;
  int displayScl = 22;
  String displayAddress = "0x27";

  String idleLine1 = "Firmenname";
  String timezone = "CET-1CEST,M3.5.0/2,M10.5.0/3";
  String ntpServer = "pool.ntp.org";
  int timeOffsetHours = 0;
};

Config cfg;

MFRC522 *mfrc = nullptr;
Adafruit_PN532 *pn532 = nullptr;
#if HAS_LCD_I2C
LiquidCrystal_I2C *lcd = nullptr;
#endif

unsigned long lastIdleRefresh = 0;
unsigned long messageUntil = 0;
unsigned long lastScanAt = 0;
String lastScanUid = "";
String line1 = "";
String line2 = "";
String line3 = "";
String line4 = "";

struct CardState {
  String uid;
  String lastAction; // CLOCK_IN / CLOCK_OUT
};
CardState cardStates[64];
int cardStateCount = 0;

String toHexUid(const uint8_t *uid, uint8_t len) {
  String out;
  char buf[3];
  for (uint8_t i = 0; i < len; i++) {
    snprintf(buf, sizeof(buf), "%02X", uid[i]);
    out += buf;
  }
  return out;
}

String jsonStringOr(JsonVariantConst value, const char *fallback) {
  if (value.is<const char*>()) {
    const char *s = value.as<const char*>();
    if (s) return String(s);
    return String(fallback);
  }
  if (value.is<String>()) return value.as<String>();
  return String(fallback);
}

uint8_t parseHexByte(const String &hex2) {
  return (uint8_t) strtoul(hex2.c_str(), nullptr, 16);
}

uint8_t parseAddress(const String &v) {
  if (v.startsWith("0x") || v.startsWith("0X")) return (uint8_t) strtoul(v.c_str(), nullptr, 16);
  return (uint8_t) v.toInt();
}

bool isBerlinDstAtUtcEpoch(time_t utcEpoch) {
  struct tm utc = {};
  gmtime_r(&utcEpoch, &utc);
  int y = utc.tm_year + 1900;
  int m = utc.tm_mon + 1;  // 1..12
  int d = utc.tm_mday;     // 1..31
  int h = utc.tm_hour;     // 0..23

  auto isLeap = [](int year) -> bool {
    return (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
  };
  auto daysInMonth = [&](int year, int month) -> int {
    static const int mdays[12] = { 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31 };
    if (month == 2) return isLeap(year) ? 29 : 28;
    return mdays[month - 1];
  };
  auto weekday = [](int year, int month, int day) -> int {
    // Sakamoto, Rueckgabe: 0=Sonntag ... 6=Samstag
    static int t[12] = { 0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4 };
    if (month < 3) year -= 1;
    return (year + year / 4 - year / 100 + year / 400 + t[month - 1] + day) % 7;
  };
  auto lastSunday = [&](int year, int month) -> int {
    int dim = daysInMonth(year, month);
    int dowLastDay = weekday(year, month, dim); // 0..6
    return dim - dowLastDay;
  };

  if (m < 3 || m > 10) return false;
  if (m > 3 && m < 10) return true;

  if (m == 3) {
    int ls = lastSunday(y, 3);
    if (d > ls) return true;
    if (d < ls) return false;
    return h >= 1; // Umstellung auf Sommerzeit um 01:00 UTC
  }

  // m == 10
  int ls = lastSunday(y, 10);
  if (d < ls) return true;
  if (d > ls) return false;
  return h < 1; // Rueckstellung auf Winterzeit um 01:00 UTC
}

String nowDateTime() {
  time_t nowUtc = time(nullptr);
  if (nowUtc <= 0) return "Zeit nicht verfuegbar";
  int baseOffsetHours = isBerlinDstAtUtcEpoch(nowUtc) ? 2 : 1;
  time_t localTs = nowUtc + ((baseOffsetHours + cfg.timeOffsetHours) * 3600);
  struct tm adj = {};
  gmtime_r(&localTs, &adj);
  char buf[24];
  strftime(buf, sizeof(buf), "%d.%m.%Y %H:%M", &adj);
  return String(buf);
}

String addHourOffsetToHHMM(const String &hhmm, int offsetHours) {
  if (hhmm.length() < 5 || hhmm.charAt(2) != ':') return hhmm;
  int h = hhmm.substring(0, 2).toInt();
  int m = hhmm.substring(3, 5).toInt();
  int total = ((h * 60 + m) + (offsetHours * 60)) % (24 * 60);
  if (total < 0) total += 24 * 60;
  int nh = total / 60;
  int nm = total % 60;
  char b[6];
  snprintf(b, sizeof(b), "%02d:%02d", nh, nm);
  return String(b);
}

void drawDisplay() {
  #if HAS_LCD_I2C
  if (!lcd || !cfg.displayEnabled) return;
  lcd->clear();
  lcd->setCursor(0, 0);
  lcd->print(line1.substring(0, 20));
  if (cfg.displayRows > 1) {
    lcd->setCursor(0, 1);
    lcd->print(line2.substring(0, 20));
  }
  if (cfg.displayRows > 2) {
    lcd->setCursor(0, 2);
    lcd->print(line3.substring(0, 20));
  }
  if (cfg.displayRows > 3) {
    lcd->setCursor(0, 3);
    lcd->print(line4.substring(0, 20));
  }
  #endif
}

void showIdle() {
  line1 = cfg.idleLine1;
  line2 = nowDateTime();
  line3 = "Karte scannen...";
  line4 = "";
  drawDisplay();
}

void showMessage(const String &a, const String &b, const String &c = "", const String &d = "") {
  line1 = a;
  line2 = b;
  line3 = c;
  line4 = d;
  drawDisplay();
  messageUntil = millis() + 4500;
}

String getNextType(const String &uid) {
  for (int i = 0; i < cardStateCount; i++) {
    if (cardStates[i].uid == uid) {
      return cardStates[i].lastAction == "CLOCK_IN" ? "CLOCK_OUT" : "CLOCK_IN";
    }
  }
  return "CLOCK_IN";
}

void rememberAction(const String &uid, const String &action) {
  for (int i = 0; i < cardStateCount; i++) {
    if (cardStates[i].uid == uid) {
      cardStates[i].lastAction = action;
      return;
    }
  }
  if (cardStateCount < 64) {
    cardStates[cardStateCount].uid = uid;
    cardStates[cardStateCount].lastAction = action;
    cardStateCount++;
  }
}

bool loadConfig() {
  if (SPIFFS.begin(true)) {
    File f = SPIFFS.open("/config.json", "r");
    if (f) {
      StaticJsonDocument<4096> doc;
      DeserializationError err = deserializeJson(doc, f);
      f.close();
      if (!err) {
        cfg.wifiSsid = String((const char*) doc["network"]["wifiSsid"]);
        cfg.wifiPassword = String((const char*) doc["network"]["wifiPassword"]);
        cfg.endpoint = String((const char*) doc["server"]["endpoint"]);
        cfg.useTls = doc["server"]["useTls"] | false;
        cfg.terminalKey = String((const char*) doc["terminal"]["key"]);

        cfg.readerType = String((const char*) doc["hardware"]["readerType"]);
        cfg.pn532Mode = String((const char*) doc["hardware"]["pn532Mode"]);
        cfg.sda = doc["hardware"]["pins"]["sda"] | cfg.sda;
        cfg.scl = doc["hardware"]["pins"]["scl"] | cfg.scl;
        cfg.mosi = doc["hardware"]["pins"]["mosi"] | cfg.mosi;
        cfg.miso = doc["hardware"]["pins"]["miso"] | cfg.miso;
        cfg.sck = doc["hardware"]["pins"]["sck"] | cfg.sck;
        cfg.ss = doc["hardware"]["pins"]["ss"] | cfg.ss;
        cfg.rst = doc["hardware"]["pins"]["rst"] | cfg.rst;
        cfg.irq = doc["hardware"]["pins"]["irq"] | cfg.irq;

        cfg.displayEnabled = doc["hardware"]["display"]["enabled"] | false;
        cfg.displayRows = doc["hardware"]["display"]["rows"] | 4;
        cfg.displaySda = doc["hardware"]["display"]["pins"]["sda"] | 21;
        cfg.displayScl = doc["hardware"]["display"]["pins"]["scl"] | 22;
        cfg.displayAddress = String((const char*) (doc["hardware"]["display"]["pins"]["address"] | "0x27"));

        cfg.idleLine1 = String((const char*) (doc["displayBehaviour"]["idleLine1"] | "Firmenname"));
        cfg.timezone = String((const char*) (doc["timezone"] | "CET-1CEST,M3.5.0/2,M10.5.0/3"));
        cfg.ntpServer = String((const char*) (doc["ntpServer"] | "pool.ntp.org"));
        cfg.timeOffsetHours = doc["timeOffsetHours"] | 0;

        return cfg.wifiSsid.length() > 0 && cfg.endpoint.length() > 0 && cfg.terminalKey.length() > 0;
      }
      Serial.printf("JSON Fehler: %s\n", err.c_str());
    } else {
      Serial.println("/config.json nicht gefunden, pruefe lokale config_local.h");
    }
  } else {
    Serial.println("SPIFFS konnte nicht gestartet werden, pruefe lokale config_local.h");
  }

  #if HAS_LOCAL_CONFIG
  cfg.wifiSsid = String(LOCAL_WIFI_SSID);
  cfg.wifiPassword = String(LOCAL_WIFI_PASSWORD);
  cfg.endpoint = String(LOCAL_SERVER_ENDPOINT);
  cfg.useTls = LOCAL_USE_TLS;
  cfg.terminalKey = String(LOCAL_TERMINAL_KEY);
  cfg.readerType = String(LOCAL_READER_TYPE);
  cfg.pn532Mode = String(LOCAL_PN532_MODE);
  cfg.sda = LOCAL_PIN_SDA;
  cfg.scl = LOCAL_PIN_SCL;
  cfg.mosi = LOCAL_PIN_MOSI;
  cfg.miso = LOCAL_PIN_MISO;
  cfg.sck = LOCAL_PIN_SCK;
  cfg.ss = LOCAL_PIN_SS;
  cfg.rst = LOCAL_PIN_RST;
  cfg.irq = LOCAL_PIN_IRQ;
  cfg.displayEnabled = LOCAL_DISPLAY_ENABLED;
  cfg.displayRows = LOCAL_DISPLAY_ROWS;
  cfg.displaySda = LOCAL_DISPLAY_SDA;
  cfg.displayScl = LOCAL_DISPLAY_SCL;
  cfg.displayAddress = String(LOCAL_DISPLAY_ADDRESS);
  cfg.idleLine1 = String(LOCAL_IDLE_LINE1);
  cfg.timezone = String(LOCAL_TIMEZONE);
  cfg.ntpServer = String(LOCAL_NTP_SERVER);
  cfg.timeOffsetHours = LOCAL_TIME_OFFSET_HOURS;
  Serial.println("Konfiguration aus config_local.h geladen.");
  return cfg.wifiSsid.length() > 0 && cfg.endpoint.length() > 0 && cfg.terminalKey.length() > 0;
  #else
  return false;
  #endif
}

void initDisplay() {
  if (!cfg.displayEnabled) return;
  #if !HAS_LCD_I2C
  Serial.println("Hinweis: LiquidCrystal_I2C Bibliothek fehlt, Display ist deaktiviert.");
  cfg.displayEnabled = false;
  return;
  #else
  Wire.begin(cfg.displaySda, cfg.displayScl);
  lcd = new LiquidCrystal_I2C(parseAddress(cfg.displayAddress), 20, cfg.displayRows >= 4 ? 4 : 2);
  lcd->init();
  lcd->backlight();
  showMessage("Starte...", "Display aktiv");
  #endif
}

void initReader() {
  if (cfg.readerType == "RC522") {
    SPI.begin(cfg.sck, cfg.miso, cfg.mosi, cfg.ss);
    mfrc = new MFRC522(cfg.ss, cfg.rst);
    mfrc->PCD_Init();
    Serial.println("RFID Reader RC522 initialisiert");
    return;
  }

  // PN532
  if (cfg.pn532Mode == "SPI") {
    SPI.begin(cfg.sck, cfg.miso, cfg.mosi, cfg.ss);
    pn532 = new Adafruit_PN532(cfg.ss);
  } else {
    Wire.begin(cfg.sda, cfg.scl);
    // Kompatibel mit Adafruit_PN532 Bibliotheken, die fuer I2C IRQ+RST erwarten.
    pn532 = new Adafruit_PN532((uint8_t)cfg.irq, (uint8_t)cfg.rst);
  }

  pn532->begin();
  uint32_t versiondata = pn532->getFirmwareVersion();
  if (!versiondata) {
    Serial.println("PN532 nicht gefunden");
  } else {
    pn532->SAMConfig();
    Serial.println("NFC Reader PN532 initialisiert");
  }
}

String scanUid() {
  if (cfg.readerType == "RC522") {
    if (!mfrc) return "";
    if (!mfrc->PICC_IsNewCardPresent()) return "";
    if (!mfrc->PICC_ReadCardSerial()) return "";
    String uid = toHexUid(mfrc->uid.uidByte, mfrc->uid.size);
    mfrc->PICC_HaltA();
    mfrc->PCD_StopCrypto1();
    return uid;
  }

  if (!pn532) return "";
  uint8_t uid[7] = {0};
  uint8_t uidLength = 0;
  bool success = pn532->readPassiveTargetID(PN532_MIFARE_ISO14443A, uid, &uidLength, 50);
  if (!success || uidLength == 0) return "";
  return toHexUid(uid, uidLength);
}

bool sendPunch(const String &uid, const String &type, String &employeeName, String &actionLabel, String &timeLabel, float &workedTodayHours, String &errText) {
  if (WiFi.status() != WL_CONNECTED) {
    errText = "Kein WLAN";
    return false;
  }

  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secure;
  if (cfg.useTls) {
    secure.setInsecure();
    if (!http.begin(secure, cfg.endpoint)) {
      errText = "HTTP init fehlgeschlagen";
      return false;
    }
  } else {
    if (!http.begin(client, cfg.endpoint)) {
      errText = "HTTP init fehlgeschlagen";
      return false;
    }
  }

  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<512> out;
  out["terminalKey"] = cfg.terminalKey;
  out["rfidTag"] = uid;
  out["type"] = type;
  out["reasonText"] = "RFID Terminal";

  String body;
  serializeJson(out, body);
  int code = http.POST(body);

  if (code < 200 || code >= 300) {
    String response = http.getString();
    http.end();
    errText = response.length() ? response : ("HTTP " + String(code));
    return false;
  }

  String response = http.getString();
  http.end();

  StaticJsonDocument<1024> in;
  DeserializationError err = deserializeJson(in, response);
  if (err) {
    errText = "Antwort-JSON ungueltig";
    return false;
  }

  employeeName = jsonStringOr(in["employeeName"], "Mitarbeiter");
  actionLabel = jsonStringOr(in["action"], type == "CLOCK_IN" ? "KOMMEN" : "GEHEN");
  workedTodayHours = in["workedTodayHours"] | 0.0;

  String displayTime = jsonStringOr(in["displayTime"], "");
  if (displayTime.length() >= 4) {
    // Server liefert bereits Berlin-Zeit.
    timeLabel = displayTime;
  } else {
    String local = nowDateTime();
    timeLabel = local.length() >= 16 ? local.substring(11, 16) : local;
  }

  return true;
}

bool fetchNextType(const String &uid, String &nextType, String &errText, bool &blockedDuplicate) {
  blockedDuplicate = false;
  if (WiFi.status() != WL_CONNECTED) {
    errText = "Kein WLAN";
    return false;
  }
  String endpoint = cfg.endpoint;
  endpoint.replace("/punch", "/next-type");

  HTTPClient http;
  WiFiClient client;
  WiFiClientSecure secure;
  if (cfg.useTls) {
    secure.setInsecure();
    if (!http.begin(secure, endpoint)) {
      errText = "HTTP init fehlgeschlagen";
      return false;
    }
  } else {
    if (!http.begin(client, endpoint)) {
      errText = "HTTP init fehlgeschlagen";
      return false;
    }
  }
  http.addHeader("Content-Type", "application/json");
  StaticJsonDocument<256> out;
  out["terminalKey"] = cfg.terminalKey;
  out["rfidTag"] = uid;
  String body;
  serializeJson(out, body);
  int code = http.POST(body);
  if (code < 200 || code >= 300) {
    errText = http.getString();
    http.end();
    return false;
  }
  String response = http.getString();
  http.end();
  StaticJsonDocument<512> in;
  DeserializationError err = deserializeJson(in, response);
  if (err) {
    errText = "Antwort-JSON ungueltig";
    return false;
  }
  bool blocked = in["blockedDuplicate"] | false;
  if (blocked) {
    blockedDuplicate = true;
    errText = "Doppelbuchung blockiert";
    return false;
  }
  nextType = jsonStringOr(in["nextType"], "");
  if (nextType != "CLOCK_IN" && nextType != "CLOCK_OUT") {
    errText = "Ungueltiger Serverstatus";
    return false;
  }
  return true;
}

void connectWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(cfg.wifiSsid.c_str(), cfg.wifiPassword.c_str());
  Serial.printf("Verbinde WLAN %s", cfg.wifiSsid.c_str());
  int tries = 0;
  while (WiFi.status() != WL_CONNECTED && tries < 60) {
    delay(500);
    Serial.print(".");
    tries++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("WLAN verbunden: %s\n", WiFi.localIP().toString().c_str());
    showMessage("WLAN verbunden", WiFi.localIP().toString());
  } else {
    Serial.println("WLAN Verbindung fehlgeschlagen");
    showMessage("WLAN Fehler", "Bitte Neustart");
  }
}

void initClock() {
  setenv("TZ", cfg.timezone.c_str(), 1);
  tzset();
  configTime(0, 0, cfg.ntpServer.c_str(), "time.nist.gov");
}

void setup() {
  Serial.begin(115200);
  delay(400);

  if (!loadConfig()) {
    Serial.println("Konfiguration fehlt/ungueltig.");
    return;
  }

  initDisplay();
  showMessage("ESP32 Terminal", "Starte...");

  connectWifi();
  initClock();
  initReader();

  showIdle();
}

void loop() {
  if (cfg.wifiSsid.length() == 0) {
    delay(1000);
    return;
  }

  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
  }

  String uid = scanUid();
  if (uid.length() > 0) {
    if (uid == lastScanUid && millis() - lastScanAt < 3000) {
      delay(40);
      return;
    }
    lastScanUid = uid;
    lastScanAt = millis();

    Serial.printf("Karte erkannt: %s\n", uid.c_str());

    String type = getNextType(uid);
    String statusErr;
    String serverType;
    bool blockedDuplicate = false;
    bool hasServerStatus = fetchNextType(uid, serverType, statusErr, blockedDuplicate);
    if (!hasServerStatus) {
      if (blockedDuplicate) {
        showMessage("Buchung blockiert", "Doppeltes Scannen");
        Serial.println("Doppelbuchung blockiert");
      } else {
        showMessage("Status Fehler", "Serverstatus fehlt");
        Serial.printf("Status Fehler: %s\n", statusErr.c_str());
      }
      delay(700);
      return;
    }
    Serial.printf("Serverstatus: %s\n", serverType.c_str());
    if (serverType == "CLOCK_IN" || serverType == "CLOCK_OUT") {
      type = serverType;
    } else {
      showMessage("Buchung blockiert", "Doppeltes Scannen");
      Serial.println("Unbekannter Serverstatus");
      delay(700);
      return;
    }
    String employeeName;
    String actionLabel;
    String timeLabel;
    float workedTodayHours = 0.0;
    String errText;

    bool ok = sendPunch(uid, type, employeeName, actionLabel, timeLabel, workedTodayHours, errText);
    if (ok) {
      rememberAction(uid, actionLabel == "KOMMEN" ? "CLOCK_IN" : "CLOCK_OUT");
      if (actionLabel == "GEHEN") {
        showMessage(employeeName, "Gehen " + timeLabel, "Heute: " + String(workedTodayHours, 2) + " h");
      } else {
        showMessage(employeeName, "Kommen " + timeLabel);
      }
      Serial.printf("%s %s %s / Heute %.2f h\n", employeeName.c_str(), actionLabel.c_str(), timeLabel.c_str(), workedTodayHours);
    } else {
      if (actionLabel == "BLOCKIERT") {
        showMessage(employeeName, "Doppelbuchung", "blockiert " + timeLabel);
        Serial.printf("%s Doppelbuchung blockiert %s\n", employeeName.c_str(), timeLabel.c_str());
      } else {
        showMessage("Buchung fehlgeschl.", errText.substring(0, 20));
        Serial.printf("Punch Fehler: %s\n", errText.c_str());
      }
    }

    delay(700);
  }

  if (cfg.displayEnabled && millis() > messageUntil && millis() - lastIdleRefresh > 1000) {
    showIdle();
    lastIdleRefresh = millis();
  }

  delay(40);
}

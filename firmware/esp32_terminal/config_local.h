#pragma once

// Automatisch aus ESP32 Provisioning erzeugt
#define LOCAL_WIFI_SSID "IoT"
#define LOCAL_WIFI_PASSWORD "!desischmeiWlanduNudeldunger\""
#define LOCAL_SERVER_ENDPOINT "http://192.168.0.100:26400/api/terminal/punch"
#define LOCAL_USE_TLS false
#define LOCAL_TERMINAL_KEY "1f2c1770fa442a646d417bce5901fab5d685617426dbffee"

#define LOCAL_READER_TYPE "RC522"
#define LOCAL_PN532_MODE "I2C"

#define LOCAL_PIN_SDA 21
#define LOCAL_PIN_SCL 22
#define LOCAL_PIN_MOSI 23
#define LOCAL_PIN_MISO 19
#define LOCAL_PIN_SCK 18
#define LOCAL_PIN_SS 5
#define LOCAL_PIN_RST 22
#define LOCAL_PIN_IRQ 4

#define LOCAL_DISPLAY_ENABLED true
#define LOCAL_DISPLAY_ROWS 4
#define LOCAL_DISPLAY_SDA 21
#define LOCAL_DISPLAY_SCL 22
#define LOCAL_DISPLAY_ADDRESS "0x27"
#define LOCAL_IDLE_LINE1 "Metallbau Kopf"

#define LOCAL_TIMEZONE "CET-1CEST,M3.5.0/2,M10.5.0/3"
#define LOCAL_NTP_SERVER "pool.ntp.org"

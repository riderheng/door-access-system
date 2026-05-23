/**
 * ESP32 Door Access Controller
 * Hardware: ESP32 + Relay + Solenoid Lock 12V + Reed Switch MC-38
 *           + Buzzer + LED + 2x Push Button
 *
 * วงจรไฟ:
 *   12V Adapter ──┬── Relay COM / Solenoid (ผ่าน Relay NO)
 *                 └── Step-Down IN (12V→5V)
 *   Step-Down OUT ──── ESP32 VIN, Buzzer+
 *   ESP32 3.3V ──────── Pull-up 10k ของ Button/Reed Switch
 *
 * Pin Map:
 *   GPIO 13 → Relay IN           (HIGH = unlock solenoid)
 *   GPIO 34 → Reed Switch MC-38  (LOW = ประตูปิด, HIGH = ประตูเปิด)
 *   GPIO  4 → Push Button ใน     (INPUT_PULLUP, LOW = กด)
 *   GPIO 18 → Push Button นอก    (INPUT_PULLUP, LOW = กด)
 *   GPIO  5 → Active Buzzer 5V
 *   GPIO  2 → LED (330Ω ต่ออนุกรม)
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <time.h>

// ===== ตั้งค่า — แก้ค่าเหล่านี้ =====
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* BACKEND_URL   = "http://192.168.x.x:3000";  // IP ของ Server
const char* ROOM_ID       = "room_101";
int DEFAULT_STUDENT_ID    = 6410101;

// ===== Pins =====
#define RELAY_PIN      13   // Relay IN → ล็อค/ปลดล็อค Solenoid
#define REED_PIN       34   // Reed Switch MC-38 (door sensor)
#define BTN_INSIDE      4   // ปุ่มกันน้ำในห้อง (ออกห้อง)
#define BTN_OUTSIDE    18   // ปุ่มกันน้ำนอกห้อง (เรียก/ขอเปิด)
#define BUZZER_PIN      5   // Active Buzzer 5V
#define LED_PIN         2   // LED + ตัวต้านทาน 330Ω

// ===== Timing =====
#define UNLOCK_DURATION_MS   5000   // ปลดล็อคนาน 5 วินาที
#define POLL_INTERVAL_MS     2000   // poll server ทุก 2 วิ
#define LOCK_RETRY_INTERVAL  1000   // retry ล็อคทุก 1 วิ ถ้าประตูยังเปิด
#define MAX_LOCK_RETRIES       10   // retry สูงสุด 10 ครั้ง (~10 วิ) แล้วแจ้งเตือน
#define DEBOUNCE_MS            50
#define LONG_PRESS_MS        2000

// ===== State =====
bool isWiFiConnected      = false;
bool isDoorUnlocked       = false;
bool isDoorPhysicallyOpen = false;   // จาก Reed Switch
unsigned long unlockStartTime  = 0;
unsigned long lastPollTime     = 0;
unsigned long lastLockRetryTime= 0;
int lockRetryCount             = 0;
bool waitingToLock             = false;

// Button debounce
unsigned long btnInsidePressTime  = 0;
unsigned long btnOutsidePressTime = 0;
bool btnInsidePressed  = false;
bool btnOutsidePressed = false;

// ===== Prototypes =====
void setupWiFi();
void pollServerCommand();
void unlockDoor(const char* reason);
void tryLockDoor();
void forceLockDoor();
void handleButtons();
void readReedSwitch();
void sendDoorStatus(const char* status);
void sendDoorLeftOpenAlert();
void saveOfflineExit(int studentId, const char* reason);
void syncOfflineData();
void beep(int ms, int times = 1);
void blinkLED(int times);

// ══════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== ESP32 Door Access Controller ===");

  pinMode(RELAY_PIN,    OUTPUT);
  pinMode(BUZZER_PIN,   OUTPUT);
  pinMode(LED_PIN,      OUTPUT);
  pinMode(REED_PIN,     INPUT);          // Reed Switch ใช้ pull-up 10k ภายนอก
  pinMode(BTN_INSIDE,   INPUT_PULLUP);   // Pull-up ภายใน ESP32
  pinMode(BTN_OUTSIDE,  INPUT_PULLUP);

  digitalWrite(RELAY_PIN, LOW);   // เริ่มต้น: ล็อค
  digitalWrite(LED_PIN,   LOW);

  if (!SPIFFS.begin(true)) Serial.println("SPIFFS failed");

  setupWiFi();
  configTime(7 * 3600, 0, "pool.ntp.org");
  delay(500);

  // อ่าน Reed Switch ครั้งแรก
  readReedSwitch();
  Serial.printf("Room: %s | Door: %s\n", ROOM_ID, isDoorPhysicallyOpen ? "OPEN" : "CLOSED");
  beep(100);
}

void loop() {
  // ── WiFi watchdog ──
  if (WiFi.status() == WL_CONNECTED) {
    if (!isWiFiConnected) {
      isWiFiConnected = true;
      Serial.println("WiFi reconnected");
      beep(100);
      syncOfflineData();
    }
  } else {
    if (isWiFiConnected) {
      isWiFiConnected = false;
      Serial.println("WiFi lost");
    }
  }

  // ── Reed Switch — อ่านสถานะประตูตลอดเวลา ──
  readReedSwitch();

  // ── Auto re-lock หลัง UNLOCK_DURATION_MS ──
  if (isDoorUnlocked && !waitingToLock &&
      millis() - unlockStartTime >= UNLOCK_DURATION_MS) {
    Serial.println("Auto-lock timer expired");
    tryLockDoor();
  }

  // ── Retry lock ถ้าประตูยังเปิดอยู่ ──
  if (waitingToLock && millis() - lastLockRetryTime >= LOCK_RETRY_INTERVAL) {
    lastLockRetryTime = millis();
    if (!isDoorPhysicallyOpen) {
      // ประตูปิดแล้ว — ล็อคได้
      forceLockDoor();
    } else {
      lockRetryCount++;
      Serial.printf("Door still open, retry %d/%d\n", lockRetryCount, MAX_LOCK_RETRIES);
      // เตือนด้วยเสียงสั้น
      beep(100);

      if (lockRetryCount >= MAX_LOCK_RETRIES) {
        Serial.println("Max retries reached — sending alert to server");
        sendDoorLeftOpenAlert();
        // Force lock อยู่ดี (Solenoid ล็อค, ประตูจะล็อคเมื่อปิด)
        forceLockDoor();
      }
    }
  }

  // ── Poll server ──
  if (isWiFiConnected && millis() - lastPollTime >= POLL_INTERVAL_MS) {
    lastPollTime = millis();
    pollServerCommand();
  }

  // ── ปุ่ม ──
  handleButtons();

  delay(10);
}

// ─── WiFi ─────────────────────────────────────────────────────────────────────
void setupWiFi() {
  Serial.printf("Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500); Serial.print("."); attempts++;
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    isWiFiConnected = true;
    Serial.printf("IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("WiFi failed — offline mode");
  }
}

// ─── Reed Switch ──────────────────────────────────────────────────────────────
void readReedSwitch() {
  // MC-38: วงจรปิด (LOW) = ประตูปิด, วงจรเปิด (HIGH) = ประตูเปิด
  bool prev = isDoorPhysicallyOpen;
  isDoorPhysicallyOpen = (digitalRead(REED_PIN) == HIGH);

  if (prev != isDoorPhysicallyOpen) {
    Serial.printf("Door: %s\n", isDoorPhysicallyOpen ? "OPENED" : "CLOSED");
    sendDoorStatus(isDoorPhysicallyOpen ? "open" : "closed");
    // ประตูปิดสนิทขณะรอล็อค → ล็อคทันที
    if (!isDoorPhysicallyOpen && waitingToLock) {
      forceLockDoor();
    }
  }
}

// ─── Door Control ─────────────────────────────────────────────────────────────
void unlockDoor(const char* reason) {
  isDoorUnlocked   = true;
  waitingToLock    = false;
  lockRetryCount   = 0;
  unlockStartTime  = millis();

  digitalWrite(RELAY_PIN, HIGH);   // จ่ายไฟ Solenoid → ปลดล็อค
  digitalWrite(LED_PIN,   HIGH);

  Serial.printf("UNLOCKED (%s)\n", reason);
  beep(100);
  sendDoorStatus("open");
}

void tryLockDoor() {
  if (!isDoorPhysicallyOpen) {
    // ประตูปิดสนิทแล้ว — ล็อคได้เลย
    forceLockDoor();
  } else {
    // ประตูยังเปิดอยู่ — รอ
    Serial.println("Door still open — waiting to lock...");
    waitingToLock     = true;
    lockRetryCount    = 0;
    lastLockRetryTime = millis();
    beep(200, 2);   // เตือน 2 ครั้ง: "กรุณาปิดประตู"
  }
}

void forceLockDoor() {
  isDoorUnlocked  = false;
  waitingToLock   = false;
  lockRetryCount  = 0;

  digitalWrite(RELAY_PIN, LOW);    // ตัดไฟ Solenoid → ล็อค
  digitalWrite(LED_PIN,   LOW);

  Serial.println("LOCKED");
  beep(50);
  sendDoorStatus("closed");
}

// ─── Poll Server ──────────────────────────────────────────────────────────────
void pollServerCommand() {
  HTTPClient http;
  char url[256];
  snprintf(url, sizeof(url), "%s/api/esp32/command/%s", BACKEND_URL, ROOM_ID);
  http.begin(url);
  http.setTimeout(3000);

  if (http.GET() == 200) {
    StaticJsonDocument<128> doc;
    if (!deserializeJson(doc, http.getString())) {
      const char* cmd = doc["command"];
      if (cmd) {
        if (strcmp(cmd, "unlock") == 0) unlockDoor("Server");
        else if (strcmp(cmd, "lock") == 0) tryLockDoor();
      }
    }
  }
  http.end();
}

// ─── Buttons ──────────────────────────────────────────────────────────────────
void handleButtons() {
  // ── ปุ่มใน (ออกห้อง) ──
  if (digitalRead(BTN_INSIDE) == LOW) {
    if (!btnInsidePressed) {
      btnInsidePressed    = true;
      btnInsidePressTime  = millis();
      beep(50);
    }
    // กดค้าง > 2 วิ = sync offline
    unsigned long held = millis() - btnInsidePressTime;
    if (held > LONG_PRESS_MS && held < LONG_PRESS_MS + 100) {
      beep(200); syncOfflineData();
    }
  } else {
    if (btnInsidePressed) {
      if (millis() - btnInsidePressTime < LONG_PRESS_MS) {
        Serial.println("Inside button: offline exit");
        beep(100); blinkLED(1);
        saveOfflineExit(DEFAULT_STUDENT_ID, "ปุ่มออกห้องด้านใน");
        if (isWiFiConnected) syncOfflineData();
      }
      btnInsidePressed = false;
    }
  }

  // ── ปุ่มนอก (ขอเปิด) ── กดสั้น = unlock ชั่วคราว
  if (digitalRead(BTN_OUTSIDE) == LOW) {
    if (!btnOutsidePressed) {
      btnOutsidePressed    = true;
      btnOutsidePressTime  = millis();
      beep(50);
    }
  } else {
    if (btnOutsidePressed) {
      unsigned long held = millis() - btnOutsidePressTime;
      if (held >= DEBOUNCE_MS && held < LONG_PRESS_MS) {
        Serial.println("Outside button: manual unlock");
        unlockDoor("ปุ่มนอกห้อง");
      }
      btnOutsidePressed = false;
    }
  }
}

// ─── Server API Calls ─────────────────────────────────────────────────────────
void sendDoorStatus(const char* status) {
  if (!isWiFiConnected) return;
  HTTPClient http;
  char url[256];
  snprintf(url, sizeof(url), "%s/api/trpc/access.updateDoorStatus", BACKEND_URL);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);

  StaticJsonDocument<256> doc;
  doc["roomId"] = ROOM_ID;
  doc["status"] = status;
  String payload; serializeJson(doc, payload);
  http.POST(payload);
  http.end();
}

void sendDoorLeftOpenAlert() {
  if (!isWiFiConnected) return;
  HTTPClient http;
  char url[256];
  snprintf(url, sizeof(url), "%s/api/trpc/access.updateDoorStatus", BACKEND_URL);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(3000);

  StaticJsonDocument<256> doc;
  doc["roomId"] = ROOM_ID;
  doc["status"] = "error";
  String payload; serializeJson(doc, payload);
  http.POST(payload);
  http.end();

  // เตือนเสียงยาว
  beep(500, 3);
}

// ─── Offline Data ─────────────────────────────────────────────────────────────
void saveOfflineExit(int studentId, const char* reason) {
  time_t now = time(nullptr);
  char filename[64];
  snprintf(filename, sizeof(filename), "/exit_%ld.json", now);

  StaticJsonDocument<256> doc;
  doc["studentId"] = studentId;
  doc["roomId"]    = ROOM_ID;
  doc["reason"]    = reason;
  doc["timestamp"] = now;
  doc["synced"]    = false;

  File f = SPIFFS.open(filename, "w");
  if (f) { serializeJson(doc, f); f.close(); }
}

void syncOfflineData() {
  if (!isWiFiConnected) return;
  File root = SPIFFS.open("/");
  File file = root.openNextFile();
  int count = 0;
  while (file) {
    String name = file.name();
    if (name.startsWith("/exit_") && name.endsWith(".json")) {
      StaticJsonDocument<256> doc;
      if (!deserializeJson(doc, file) && !doc["synced"].as<bool>()) {
        HTTPClient http;
        char url[256];
        snprintf(url, sizeof(url), "%s/api/trpc/access.recordOfflineExit", BACKEND_URL);
        http.begin(url);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(3000);
        String payload; serializeJson(doc, payload);
        if (http.POST(payload) > 0) {
          doc["synced"] = true;
          File w = SPIFFS.open(name, "w");
          if (w) { serializeJson(doc, w); w.close(); }
          count++;
        }
        http.end();
      }
    }
    file = root.openNextFile();
  }
  if (count > 0) { beep(100); blinkLED(3); }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
void beep(int ms, int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, HIGH); delay(ms);
    digitalWrite(BUZZER_PIN, LOW);
    if (times > 1) delay(100);
  }
}

void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH); delay(100);
    digitalWrite(LED_PIN, LOW);  delay(100);
  }
}

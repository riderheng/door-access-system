/**
 * ESP32 Offline Mode Exit Button Firmware
 * 
 * ปุ่มออฟไลน์โหมดสำหรับออกห้องเมื่อไม่มีอินเทอร์เน็ต
 * เชื่อมต่อกับ Backend API ของระบบควบคุมการเข้าออกห้อง
 * 
 * ฮาร์ดแวร์ที่ต้องใช้:
 * - ESP32 Development Board
 * - Push Button (Momentary Switch)
 * - Buzzer (Optional)
 * - LED (Optional)
 * - Resistor 10kΩ (Pull-up)
 * 
 * การเชื่อมต่อ:
 * - Button Pin: GPIO 4 (ต่อ GND เมื่อกด)
 * - Buzzer Pin: GPIO 5
 * - LED Pin: GPIO 2
 * - WiFi: ใช้ WiFi ของ ESP32
 * 
 * ฟังก์ชัน:
 * 1. ตรวจสอบการกดปุ่ม
 * 2. ส่ง HTTP POST ไปยัง Backend API
 * 3. บันทึกข้อมูลลงใน SPIFFS (Local Storage)
 * 4. ส่ง Webhook แจ้งเตือน Admin
 * 5. ซิงค์ข้อมูลเมื่อกลับมาออนไลน์
 * 
 * การใช้งาน:
 * 1. แก้ไข Configuration ด้านล่าง (WiFi, Backend URL)
 * 2. Upload firmware ไปยัง ESP32
 * 3. เปิด Serial Monitor เพื่อดู logs
 * 4. กดปุ่มเพื่อบันทึกการออกห้อง
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <SPIFFS.h>
#include <ArduinoJson.h>
#include <time.h>

// ===== Configuration =====
// แก้ไขค่าต่อไปนี้ให้ตรงกับการตั้งค่าของคุณ
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// Backend API URL - แก้ไขให้ตรงกับ URL ของเว็บของคุณ
// ตัวอย่าง: http://192.168.1.100:3000 หรือ http://your-domain.com
const char* BACKEND_BASE_URL = "http://your-backend-url.com";
const char* BACKEND_PORT = "3000";

// Student ID และ Room ID - สามารถแก้ไขได้ตามต้องการ
// หรือสามารถอ่านจาก RFID/QR Code ได้
int DEFAULT_STUDENT_ID = 6410101;
const char* DEFAULT_ROOM_ID = "room_101";

// ===== Pin Configuration =====
#define BUTTON_PIN 4      // ปุ่มออฟไลน์โหมด
#define BUZZER_PIN 5      // เสียงแจ้งเตือน
#define LED_PIN 2         // LED สถานะ
#define DEBOUNCE_TIME 50
#define LONG_PRESS_TIME 2000

// ===== Global Variables =====
unsigned long lastButtonPress = 0;
unsigned long buttonPressTime = 0;
bool buttonPressed = false;
bool isWiFiConnected = false;
int offlineExitCount = 0;
String backendURL = "";

// ===== Function Prototypes =====
void setupWiFi();
void handleButtonPress();
void recordOfflineExit(int studentId, const char* roomId, const char* reason);
void sendToBackend(int studentId, const char* roomId, const char* reason);
void saveToSPIFFS(int studentId, const char* roomId, const char* reason);
void syncOfflineData();
void playBeep(int duration = 200);
void blinkLED(int times = 1);
void printStatus();
String buildBackendURL();

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n\n========================================");
  Serial.println("  ESP32 Offline Exit Button Firmware");
  Serial.println("  Door Access Control System");
  Serial.println("========================================");
  Serial.println("Initializing...\n");

  // ===== Pin Setup =====
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(LED_PIN, LOW);

  // ===== SPIFFS Setup =====
  if (!SPIFFS.begin(true)) {
    Serial.println("❌ SPIFFS Mount Failed");
    playBeep(500);
    return;
  }
  Serial.println("✓ SPIFFS Mounted Successfully");

  // ===== WiFi Setup =====
  setupWiFi();

  // ===== Set Time =====
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
  Serial.println("⏱ Syncing time with NTP...");
  time_t now = time(nullptr);
  int timeoutCount = 0;
  while (now < 24 * 3600 && timeoutCount < 20) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    timeoutCount++;
  }
  Serial.println();
  Serial.println("✓ Time synced");

  // ===== Build Backend URL =====
  backendURL = buildBackendURL();
  Serial.print("Backend URL: ");
  Serial.println(backendURL);

  // ===== Initial Status =====
  printStatus();
  delay(1000);
}

void loop() {
  // ตรวจสอบสถานะ WiFi
  if (WiFi.status() == WL_CONNECTED) {
    if (!isWiFiConnected) {
      isWiFiConnected = true;
      Serial.println("\n✓ WiFi Connected!");
      playBeep(100);
      blinkLED(2);
      syncOfflineData();
    }
  } else {
    if (isWiFiConnected) {
      isWiFiConnected = false;
      Serial.println("\n❌ WiFi Disconnected!");
      playBeep(300);
    }
  }

  // ตรวจสอบการกดปุ่ม
  handleButtonPress();

  delay(10);
}

/**
 * สร้าง Backend URL จากค่า Configuration
 */
String buildBackendURL() {
  String url = String(BACKEND_BASE_URL);
  
  // ถ้า URL ไม่มี port ให้เพิ่ม port เข้าไป
  if (url.indexOf(":") == -1 && String(BACKEND_PORT) != "80") {
    url += ":";
    url += BACKEND_PORT;
  }
  
  return url;
}

/**
 * ตั้งค่า WiFi
 */
void setupWiFi() {
  Serial.print("📡 Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("✓ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    isWiFiConnected = true;
    playBeep(100);
    blinkLED(1);
  } else {
    Serial.println();
    Serial.println("❌ WiFi Connection Failed - Starting in Offline Mode");
    isWiFiConnected = false;
    playBeep(300);
  }
}

/**
 * ตรวจสอบการกดปุ่ม
 */
void handleButtonPress() {
  int buttonState = digitalRead(BUTTON_PIN);

  // ปุ่มถูกกด (LOW = pressed, HIGH = released)
  if (buttonState == LOW) {
    if (!buttonPressed) {
      // ปุ่มเพิ่งถูกกด
      buttonPressed = true;
      buttonPressTime = millis();
      Serial.println("\n[Button] Pressed");
      playBeep(50);
    }

    // ตรวจสอบการกดนาน > 2 วินาที
    unsigned long pressDuration = millis() - buttonPressTime;
    if (pressDuration > LONG_PRESS_TIME && pressDuration < LONG_PRESS_TIME + 100) {
      Serial.println("[Button] Long press detected - Syncing offline data");
      playBeep(200);
      syncOfflineData();
    }
  } else {
    // ปุ่มถูกปล่อย
    if (buttonPressed) {
      unsigned long pressDuration = millis() - buttonPressTime;

      // ตรวจสอบว่าเป็นการกดปกติ (< 2 วินาที)
      if (pressDuration < LONG_PRESS_TIME) {
        Serial.println("[Button] Short press detected - Recording offline exit");
        playBeep(100);
        blinkLED(1);

        // บันทึกการออกห้อง
        recordOfflineExit(
          DEFAULT_STUDENT_ID,
          DEFAULT_ROOM_ID,
          "Offline exit button pressed"
        );
      }

      buttonPressed = false;
    }
  }
}

/**
 * บันทึกการออกห้องแบบออฟไลน์
 */
void recordOfflineExit(int studentId, const char* roomId, const char* reason) {
  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║  Recording Offline Exit            ║");
  Serial.println("╚════════════════════════════════════╝");
  Serial.print("Student ID: ");
  Serial.println(studentId);
  Serial.print("Room ID: ");
  Serial.println(roomId);
  Serial.print("Reason: ");
  Serial.println(reason);

  // บันทึกลงใน SPIFFS
  saveToSPIFFS(studentId, roomId, reason);

  // ถ้า WiFi เชื่อมต่ออยู่ ให้ส่งไปยัง Backend ทันที
  if (isWiFiConnected) {
    sendToBackend(studentId, roomId, reason);
  } else {
    Serial.println("⚠ Offline - Data saved to SPIFFS, will sync when online");
    playBeep(150);
  }

  offlineExitCount++;
  printStatus();
}

/**
 * ส่งข้อมูลไปยัง Backend API
 */
void sendToBackend(int studentId, const char* roomId, const char* reason) {
  if (!isWiFiConnected) {
    Serial.println("❌ WiFi not connected - Cannot send to backend");
    return;
  }

  HTTPClient http;
  
  // สร้าง URL สำหรับ API endpoint
  String apiURL = backendURL + "/api/trpc/access.recordOfflineExit";
  
  Serial.print("📤 Sending to: ");
  Serial.println(apiURL);

  http.begin(apiURL);
  http.addHeader("Content-Type", "application/json");

  // สร้าง JSON payload (tRPC HTTP link รับ input ที่ root ของ body)
  StaticJsonDocument<512> doc;
  doc["studentId"] = studentId;
  doc["roomId"]    = roomId;
  doc["reason"]    = reason;
  doc["timestamp"] = time(nullptr);

  String payload;
  serializeJson(doc, payload);

  Serial.print("📦 Payload: ");
  Serial.println(payload);

  int httpResponseCode = http.POST(payload);

  Serial.print("📊 HTTP Response: ");
  Serial.println(httpResponseCode);

  if (httpResponseCode > 0) {
    String response = http.getString();
    Serial.print("✓ Response: ");
    Serial.println(response);
    playBeep(100);
    blinkLED(2);
  } else {
    Serial.print("❌ Error: ");
    Serial.println(httpResponseCode);
    playBeep(300);
  }

  http.end();
}

/**
 * บันทึกข้อมูลลงใน SPIFFS (Local Storage)
 */
void saveToSPIFFS(int studentId, const char* roomId, const char* reason) {
  // สร้าง filename ด้วย timestamp
  time_t now = time(nullptr);
  char filename[64];
  sprintf(filename, "/offline_%ld.json", now);

  // สร้าง JSON
  StaticJsonDocument<256> doc;
  doc["studentId"] = studentId;
  doc["roomId"] = roomId;
  doc["reason"] = reason;
  doc["timestamp"] = now;
  doc["synced"] = false;

  // เขียนลงไฟล์
  File file = SPIFFS.open(filename, "w");
  if (!file) {
    Serial.println("❌ Failed to open file for writing");
    return;
  }

  serializeJson(doc, file);
  file.close();

  Serial.print("💾 Data saved to: ");
  Serial.println(filename);
}

/**
 * ซิงค์ข้อมูลออฟไลน์เมื่อกลับมาออนไลน์
 */
void syncOfflineData() {
  if (!isWiFiConnected) {
    Serial.println("❌ WiFi not connected - Cannot sync");
    return;
  }

  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║  Syncing Offline Data              ║");
  Serial.println("╚════════════════════════════════════╝");

  File root = SPIFFS.open("/");
  File file = root.openNextFile();

  int syncedCount = 0;
  int failedCount = 0;

  while (file) {
    String filename = file.name();

    // ตรวจสอบว่าเป็นไฟล์ offline data
    if (filename.startsWith("/offline_") && filename.endsWith(".json")) {
      Serial.print("🔄 Syncing: ");
      Serial.println(filename);

      // อ่านข้อมูล
      StaticJsonDocument<256> doc;
      deserializeJson(doc, file);

      // ส่งไปยัง Backend
      if (doc["synced"] == false) {
        sendToBackend(
          doc["studentId"],
          doc["roomId"].as<const char*>(),
          doc["reason"].as<const char*>()
        );

        // ทำเครื่องหมายว่าซิงค์แล้ว
        doc["synced"] = true;
        File writeFile = SPIFFS.open(filename, "w");
        serializeJson(doc, writeFile);
        writeFile.close();

        syncedCount++;
      }
    }

    file = root.openNextFile();
  }

  Serial.print("✓ Synced: ");
  Serial.print(syncedCount);
  Serial.println(" records");

  if (failedCount > 0) {
    Serial.print("⚠ Failed: ");
    Serial.print(failedCount);
    Serial.println(" records");
  }

  if (syncedCount > 0) {
    playBeep(100);
    blinkLED(3);
  }
}

/**
 * เล่นเสียง Beep
 */
void playBeep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
}

/**
 * กระพริบ LED
 */
void blinkLED(int times) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(100);
    digitalWrite(LED_PIN, LOW);
    delay(100);
  }
}

/**
 * แสดงสถานะระบบ
 */
void printStatus() {
  Serial.println("\n╔════════════════════════════════════╗");
  Serial.println("║       System Status                ║");
  Serial.println("╚════════════════════════════════════╝");
  Serial.print("WiFi: ");
  Serial.println(isWiFiConnected ? "✓ Connected" : "❌ Disconnected");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Offline Exit Count: ");
  Serial.println(offlineExitCount);
  Serial.print("Backend URL: ");
  Serial.println(backendURL);
  Serial.print("SPIFFS Free Space: ");
  Serial.print(SPIFFS.totalBytes() - SPIFFS.usedBytes());
  Serial.println(" bytes");
  Serial.println("════════════════════════════════════\n");
}

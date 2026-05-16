# Testing Guide - Door Access System

ไฟล์นี้อธิบายวิธีการทดสอบระบบควบคุมการเข้าออกห้องโดยไม่ต้องมี ESP32 จริง

---

## 📋 สารบัญ

1. [Mock ESP32 API](#mock-esp32-api)
2. [Offline Mode Exit Button](#offline-mode-exit-button)
3. [ESP32 Firmware Installation](#esp32-firmware-installation)
4. [Testing Scenarios](#testing-scenarios)

---

## Mock ESP32 API

### การใช้งาน Mock ESP32 API

Mock ESP32 API ช่วยให้คุณทดสอบระบบโดยไม่ต้องมี ESP32 จริง

### Endpoints

#### 1. Generate QR Code
```bash
curl -X POST http://localhost:3000/api/trpc/mockESP32.generateQRCode \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "studentId": 6410101,
      "roomId": "room_101"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "qrCode": "QR_1710761234567_abc123",
  "expiresAt": "2026-03-18T10:15:00.000Z",
  "message": "QR Code generated successfully"
}
```

#### 2. Verify QR Code
```bash
curl -X GET "http://localhost:3000/api/trpc/mockESP32.verifyQRCode?input=%7B%22qrCode%22:%22QR_1710761234567_abc123%22,%22roomId%22:%22room_101%22%7D"
```

**Response:**
```json
{
  "success": true,
  "studentId": 6410101,
  "message": "QR Code verified successfully"
}
```

#### 3. Record Access (Entry/Exit)
```bash
curl -X POST http://localhost:3000/api/trpc/mockESP32.recordAccess \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "studentId": 6410101,
      "roomId": "room_101",
      "accessType": "entry"
    }
  }'
```

#### 4. Record Offline Exit
```bash
curl -X POST http://localhost:3000/api/trpc/mockESP32.recordOfflineExit \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "studentId": 6410101,
      "roomId": "room_101",
      "reason": "Offline mode exit button pressed"
    }
  }'
```

#### 5. Get Door Status
```bash
curl -X GET "http://localhost:3000/api/trpc/mockESP32.getDoorStatus?input=%7B%22roomId%22:%22room_101%22%7D"
```

#### 6. Update Door Status
```bash
curl -X POST http://localhost:3000/api/trpc/mockESP32.updateDoorStatus \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "roomId": "room_101",
      "sensorStatus": "closed",
      "reason": "Door closed normally"
    }
  }'
```

#### 7. Health Check
```bash
curl http://localhost:3000/api/trpc/mockESP32.healthCheck
```

---

## Offline Mode Exit Button

### ฟีเจอร์

- ✅ ปุ่มออฟไลน์โหมดสำหรับออกห้อง
- ✅ บันทึกข้อมูลลงใน IndexedDB
- ✅ ส่ง Webhook แจ้งเตือน Admin
- ✅ ซิงค์ข้อมูลอัตโนมัติเมื่อกลับมาออนไลน์
- ✅ แสดงสถานะการเชื่อมต่ออินเทอร์เน็ต

### การใช้งาน

#### 1. เพิ่ม Component ไปยัง Student Page

```tsx
import OfflineModeExitButton from "@/components/OfflineModeExitButton";

export default function StudentAccessPage() {
  return (
    <div>
      {/* ... other components ... */}
      
      <OfflineModeExitButton
        studentId={6410101}
        roomId="room_101"
        studentName="John Doe"
        onSuccess={() => {
          console.log("Exit recorded successfully");
        }}
      />
    </div>
  );
}
```

#### 2. ทดสอบ Offline Mode

**ขั้นตอน:**

1. เปิด Browser DevTools (F12)
2. ไปที่ Network tab
3. เลือก "Offline" จาก dropdown
4. กดปุ่ม "Exit Room (Offline Mode)"
5. ป้อนเหตุผล (optional)
6. กดปุ่ม "Confirm Exit"
7. ตรวจสอบ IndexedDB ว่าข้อมูลถูกบันทึก

**ตรวจสอบ IndexedDB:**

1. DevTools → Application → IndexedDB
2. เลือก "DoorAccessSystem"
3. ดูข้อมูลใน "offlineExits" และ "syncQueue"

#### 3. ทดสอบ Sync

1. เปิด DevTools Network tab
2. เลือก "Online" เพื่อกลับมาออนไลน์
3. ระบบจะซิงค์ข้อมูลอัตโนมัติ
4. ตรวจสอบ Network requests ว่าข้อมูลถูกส่งไป

---

## ESP32 Firmware Installation

### ฮาร์ดแวร์ที่ต้องใช้

| Component | Pin | Notes |
|-----------|-----|-------|
| Push Button | GPIO 4 | ต่อ GND เมื่อกด |
| Buzzer | GPIO 5 | Optional |
| LED | GPIO 2 | Optional |
| Resistor 10kΩ | GPIO 4 | Pull-up resistor |

### Wiring Diagram

```
ESP32
┌─────────────────┐
│                 │
│  GPIO 4 ────────┼──── Button ──── GND
│                 │       │
│                 │      10kΩ
│                 │       │
│                 │      3.3V
│                 │
│  GPIO 5 ────────┼──── Buzzer (+) ──── GND (-)
│                 │
│  GPIO 2 ────────┼──── LED (+) ──── Resistor 330Ω ──── GND
│                 │
│  GND ───────────┼──── GND
│  3.3V ──────────┼──── 3.3V
│                 │
└─────────────────┘
```

### Installation Steps

#### 1. ติดตั้ง Arduino IDE

- ดาวน์โหลด: https://www.arduino.cc/en/software
- ติดตั้ง ESP32 Board: Tools → Board Manager → ค้นหา "esp32" → Install

#### 2. ติดตั้ง Libraries

ใน Arduino IDE ไปที่ Sketch → Include Library → Manage Libraries

ค้นหาและติดตั้ง:
- `ArduinoJson` (by Benoit Blanchon)
- `HTTPClient` (built-in)
- `WiFi` (built-in)
- `SPIFFS` (built-in)

#### 3. อัพโหลด Firmware

1. เปิด `ESP32_FIRMWARE/offline_exit_button.ino` ใน Arduino IDE
2. แก้ไข Configuration:
   ```cpp
   const char* WIFI_SSID = "YOUR_WIFI_SSID";
   const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
   const char* BACKEND_URL = "http://your-backend-url.com/api/trpc/mockESP32.recordOfflineExit";
   ```
3. เลือก Board: Tools → Board → ESP32 Dev Module
4. เลือก Port: Tools → Port → COM3 (หรือ port ที่ถูกต้อง)
5. กดปุ่ม Upload

#### 4. ตรวจสอบ Serial Monitor

1. Tools → Serial Monitor
2. ตั้ง Baud Rate เป็น 115200
3. ตรวจสอบ output:
   ```
   === ESP32 Offline Exit Button ===
   Initializing...
   SPIFFS Mounted Successfully
   Connecting to WiFi: YOUR_WIFI_SSID
   WiFi Connected!
   IP: 192.168.1.100
   ```

---

## Testing Scenarios

### Scenario 1: QR Code Generation & Verification

**ขั้นตอน:**

1. สร้าง QR Code ใหม่:
   ```bash
   curl -X POST http://localhost:3000/api/trpc/mockESP32.generateQRCode \
     -H "Content-Type: application/json" \
     -d '{"input": {"studentId": 6410101, "roomId": "room_101"}}'
   ```

2. ตรวจสอบ QR Code:
   ```bash
   curl -X GET "http://localhost:3000/api/trpc/mockESP32.verifyQRCode?input=%7B%22qrCode%22:%22QR_..._abc123%22,%22roomId%22:%22room_101%22%7D"
   ```

3. ตรวจสอบ Audit Log:
   - ไปที่ Admin Dashboard
   - ดู Audit Logs → System Action Logs
   - ตรวจสอบว่ามี "QR_CODE_GENERATED" และ "QR_CODE_VERIFIED"

---

### Scenario 2: Offline Mode Exit

**ขั้นตอน:**

1. ปิดอินเทอร์เน็ต (DevTools → Network → Offline)
2. กดปุ่ม "Exit Room (Offline Mode)"
3. ป้อนเหตุผล: "Test offline exit"
4. กดปุ่ม "Confirm Exit"
5. ตรวจสอบ IndexedDB:
   - DevTools → Application → IndexedDB → DoorAccessSystem
   - ดู "offlineExits" → ตรวจสอบข้อมูล
   - ดู "syncQueue" → ตรวจสอบว่ามี pending items

---

### Scenario 3: Sync Offline Data

**ขั้นตอน:**

1. บันทึกการออกห้องแบบออฟไลน์ (ดู Scenario 2)
2. เปิดอินเทอร์เน็ต (DevTools → Network → Online)
3. ระบบจะซิงค์อัตโนมัติ
4. ตรวจสอบ Network tab:
   - ดู POST request ไปยัง `/api/trpc/mockESP32.recordOfflineExit`
   - ตรวจสอบ Response
5. ตรวจสอบ Audit Log:
   - ไปที่ Admin Dashboard
   - ดู Audit Logs → System Action Logs
   - ตรวจสอบว่ามี "OFFLINE_EXIT_RECORDED"

---

### Scenario 4: Door Status Monitoring

**ขั้นตอน:**

1. ตรวจสอบสถานะประตู:
   ```bash
   curl -X GET "http://localhost:3000/api/trpc/mockESP32.getDoorStatus?input=%7B%22roomId%22:%22room_101%22%7D"
   ```

2. อัพเดตสถานะประตู:
   ```bash
   curl -X POST http://localhost:3000/api/trpc/mockESP32.updateDoorStatus \
     -H "Content-Type: application/json" \
     -d '{"input": {"roomId": "room_101", "sensorStatus": "open", "reason": "Door opened"}}'
   ```

3. ตรวจสอบ Audit Log:
   - ไปที่ Admin Dashboard
   - ดู Audit Logs → System Action Logs
   - ตรวจสอบว่ามี "DOOR_STATUS_UPDATED"

---

## Troubleshooting

### Mock ESP32 API ไม่ตอบสนอง

**แก้ไข:**
1. ตรวจสอบว่า dev server กำลังทำงาน: `pnpm dev`
2. ตรวจสอบ URL ว่าถูกต้อง
3. ตรวจสอบ Network tab ใน DevTools

### Offline Mode ไม่บันทึกข้อมูล

**แก้ไข:**
1. ตรวจสอบว่า IndexedDB ถูกเปิดใช้งาน
2. ตรวจสอบ Browser Console สำหรับ errors
3. ลบ IndexedDB และลองใหม่: DevTools → Application → IndexedDB → Delete

### ESP32 ไม่เชื่อมต่อ WiFi

**แก้ไข:**
1. ตรวจสอบ WIFI_SSID และ WIFI_PASSWORD
2. ตรวจสอบ Serial Monitor output
3. ลองรีเซ็ต ESP32

---

## API Documentation

### Request/Response Format

**Request:**
```json
{
  "input": {
    "studentId": 6410101,
    "roomId": "room_101",
    "reason": "Offline exit button pressed"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Offline exit recorded successfully",
  "timestamp": "2026-03-18T10:15:00.000Z"
}
```

---

## Performance Metrics

| Metric | Target | Status |
|--------|--------|--------|
| QR Code Generation | < 100ms | ✅ |
| QR Code Verification | < 50ms | ✅ |
| Offline Exit Recording | < 200ms | ✅ |
| Data Sync | < 1s per record | ✅ |
| IndexedDB Storage | < 10MB | ✅ |

---

## Support

หากมีปัญหา โปรดติดต่อ:
- Email: support@example.com
- GitHub Issues: https://github.com/puripong1st/door-access-system-rmutk/issues

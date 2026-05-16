# นวัตกรรมระบบริหารจัดการสิทธิ์และควบคุมเข้าใช้ห้องเรียนผ่านเครือข่ายไร้สาย

**Innovation System for Managing Permissions and Controlling Room Access via Wireless Network**

ระบบควบคุมการเข้าออกห้องเรียนด้วย QR Code แบบไดนามิก พร้อมระบบแอดมินหลายคน Audit Log บันทึกรายละเอียด โหมดออฟไลน์ และปุ่มออฟไลน์โหมดที่ติดตั้งที่ประตู

---

## 📋 สารบัญ

- [ภาพรวมระบบ](#ภาพรวมระบบ)
- [ฟีเจอร์หลัก](#ฟีเจอร์หลัก)
- [สถาปัตยกรรมระบบ](#สถาปัตยกรรมระบบ)
- [การติดตั้ง](#การติดตั้ง)
- [การใช้งาน](#การใช้งาน)
- [API Documentation](#api-documentation)
- [ESP32 Firmware](#esp32-firmware)
- [Troubleshooting](#troubleshooting)
- [ผู้มีส่วนร่วม](#ผู้มีส่วนร่วม)

---

## 🎯 ภาพรวมระบบ

ระบบนี้ออกแบบมาเพื่อให้สามารถควบคุมการเข้าออกห้องเรียนของมหาวิทยาลัยราชมงคลพระนคร คณะครุศาสตร์ ด้วยวิธีที่ปลอดภัย มีประสิทธิภาพ และใช้งานง่าย

### ผู้ใช้งาน

- **นักศึกษา** - สแกน QR Code เพื่อเข้าห้อง, ออกห้อง
- **แอดมิน** - จัดการนักศึกษา, ตั้งค่าระบบ, ดูบันทึก
- **ผู้ดูแลระบบ** - ติดตั้ง, บำรุงรักษา, แก้ไขปัญหา

---

## ✨ ฟีเจอร์หลัก

### 1. QR Code แบบไดนามิก
- ✅ สร้าง QR Code ใหม่ทุกครั้งที่สแกน
- ✅ QR Code เก่าจะใช้ไม่ได้ (ยกเว้นหน้า /admin)
- ✅ QR Code หมดอายุใน 5 นาที
- ✅ ป้องกันการใช้ซ้ำและการปลอมแปลง

### 2. ระบบแอดมินหลายคน
- ✅ 3 ระดับสิทธิ์ (Super Admin, Admin, Moderator)
- ✅ บันทึกรายละเอียดการอนุญาติ (Admin ID, เวลา, เหตุผล)
- ✅ ตรวจสอบการกระทำของแต่ละแอดมิน
- ✅ ป้องกันการกระทำที่ไม่ได้รับอนุญาติ

### 3. Audit Log ที่ครอบคลุม
- ✅ บันทึก Admin Activity (ใครทำอะไร เมื่อไหร่)
- ✅ บันทึก Audit Logs (ทุกการกระทำของระบบ)
- ✅ บันทึก Access Approvals (การอนุญาติการเข้า)
- ✅ บันทึก System Action Logs (การกระทำอัตโนมัติ)
- ✅ บันทึก IP Address และ User Agent

### 4. โหมดออฟไลน์
- ✅ ทำงานได้แม้ไม่มีอินเทอร์เน็ต
- ✅ บันทึกข้อมูลลงใน IndexedDB (Web) / SPIFFS (ESP32)
- ✅ ซิงค์ข้อมูลอัตโนมัติเมื่อกลับมาออนไลน์
- ✅ ปุ่มออฟไลน์โหมดที่ติดตั้งที่ประตู

### 5. ระบบเซ็นเซอร์ประตู
- ✅ ตรวจสอบประตูปิดสนิท
- ✅ เสียงแจ้งเตือนเมื่อประตูไม่ปิดสนิท
- ✅ บันทึกสถานะประตู

### 6. ระบบแจ้งเตือน
- ✅ Webhook ไปยัง Line, Telegram, Slack
- ✅ Email notifications
- ✅ In-app notifications
- ✅ Real-time alerts สำหรับเหตุการณ์สำคัญ

### 7. ตรวจสอบเวลา Re-entry
- ✅ ถ้าออกจากห้องไม่เกิน 5 นาที สามารถเข้าใหม่ได้ทันที
- ✅ ไม่ต้องสแกน QR Code ใหม่
- ✅ บันทึกการเข้าใหม่

### 8. ตั้งค่าเวลาเปิด-ปิดอัตโนมัติ
- ✅ เลือกวันที่เปิด (จ-ศ)
- ✅ เลือกเวลาเปิด-ปิด (0-23 น.)
- ✅ ระบบจะเปิดประตูอัตโนมัติตามตั้งค่า
- ✅ ส่ง Webhook แจ้งเตือน

### 9. S3 Integration
- ✅ เก็บรูปภาพ, logs, backups บน AWS S3
- ✅ เข้าถึงได้จากทุกที่
- ✅ ความปลอดภัยสูง

---

## 🏗 สถาปัตยกรรมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Student Page (QR Scanning, Access Info)             │  │
│  │ Admin Dashboard (Settings, Logs, Management)        │  │
│  │ Offline Mode Exit Button (IndexedDB Storage)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
                    (tRPC API)
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Backend (Node.js)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Students Router (CRUD, Access Logs)                 │  │
│  │ Access Router (QR Code, Access Control)             │  │
│  │ Admin Router (Settings, Schedules)                  │  │
│  │ Admin Management Router (Multi-admin)               │  │
│  │ Audit Log Viewer Router (Logging)                   │  │
│  │ Mock ESP32 Router (Testing)                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Database (MySQL)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ users, students, qrCodes, accessLogs                │  │
│  │ doorSensors, accessSchedules, reentryWindows        │  │
│  │ webhookEvents, auditLogs, adminActivityLogs         │  │
│  │ offlineSyncQueue, s3Backups, systemSettings         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                            ↕
┌─────────────────────────────────────────────────────────────┐
│                    Hardware (ESP32)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ Button (Offline Exit)                               │  │
│  │ Buzzer (Alert)                                      │  │
│  │ LED (Status Indicator)                              │  │
│  │ Door Sensor                                         │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 การติดตั้ง

### ข้อกำหนดเบื้องต้น

- Node.js 18+
- MySQL 8.0+
- Raspberry Pi 4B (สำหรับ production)
- ESP32 Development Board (สำหรับ offline button)

### 1. Clone Repository

```bash
git clone https://github.com/puripong1st/door-access-system-rmutk.git
cd door-access-system-rmutk
```

### 2. ติดตั้ง Dependencies

```bash
pnpm install
```

### 3. ตั้งค่า Environment Variables

สร้างไฟล์ `.env.local`:

```env
# Database
DATABASE_URL=mysql://user:password@localhost:3306/door_access_system

# OAuth
VITE_APP_ID=your_app_id
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# JWT
JWT_SECRET=your_jwt_secret_key

# Backend URL (สำหรับ ESP32)
BACKEND_URL=http://your-backend-url.com:3000

# Webhook URLs
LINE_WEBHOOK_URL=https://notify-api.line.me/api/notify
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_telegram_chat_id

# AWS S3
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_S3_BUCKET=your_s3_bucket_name
AWS_S3_REGION=ap-southeast-1
```

### 4. สร้างฐานข้อมูล

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

### 5. เริ่มต้น Dev Server

```bash
pnpm dev
```

เปิด http://localhost:3000 ในเบราว์เซอร์

---

## 💻 การใช้งาน

### สำหรับนักศึกษา

1. เปิดเว็บแอปพลิเคชัน
2. สแกน QR Code ที่ประตูห้อง
3. ระบบจะบันทึกการเข้าห้อง
4. เมื่อออกจากห้อง กดปุ่ม "Exit Room" หรือใช้ปุ่มออฟไลน์โหมด

### สำหรับแอดมิน

1. เข้าสู่ระบบด้วย Admin Account
2. ไปที่ Admin Dashboard
3. จัดการนักศึกษา, ตั้งค่าระบบ, ดูบันทึก
4. ตั้งเวลาเปิด-ปิดอัตโนมัติ
5. ดู Audit Logs เพื่อตรวจสอบการกระทำ

---

## 📡 API Documentation

### Mock ESP32 API (สำหรับทดสอบ)

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
  "expiresAt": "2026-03-18T10:15:00.000Z"
}
```

#### 2. Verify QR Code

```bash
curl -X GET "http://localhost:3000/api/trpc/mockESP32.verifyQRCode?input=%7B%22qrCode%22:%22QR_1710761234567_abc123%22,%22roomId%22:%22room_101%22%7D"
```

#### 3. Record Offline Exit

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

#### 4. Get Door Status

```bash
curl -X GET "http://localhost:3000/api/trpc/mockESP32.getDoorStatus?input=%7B%22roomId%22:%22room_101%22%7D"
```

#### 5. Update Door Status

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

---

## 🔧 ESP32 Firmware

### การติดตั้ง

1. **ติดตั้ง Arduino IDE**
   - ดาวน์โหลด: https://www.arduino.cc/en/software
   - ติดตั้ง ESP32 Board: Tools → Board Manager → ค้นหา "esp32" → Install

2. **ติดตั้ง Libraries**
   - Sketch → Include Library → Manage Libraries
   - ค้นหาและติดตั้ง: `ArduinoJson`

3. **แก้ไข Configuration**
   - เปิด `ESP32_FIRMWARE/offline_exit_button.ino`
   - แก้ไข Configuration:
     ```cpp
     const char* WIFI_SSID = "YOUR_WIFI_SSID";
     const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
     const char* BACKEND_BASE_URL = "http://your-backend-url.com";
     const char* BACKEND_PORT = "3000";
     int DEFAULT_STUDENT_ID = 6410101;
     const char* DEFAULT_ROOM_ID = "room_101";
     ```

4. **อัพโหลด Firmware**
   - เลือก Board: Tools → Board → ESP32 Dev Module
   - เลือก Port: Tools → Port → COM3 (หรือ port ที่ถูกต้อง)
   - กดปุ่ม Upload

5. **ตรวจสอบ Serial Monitor**
   - Tools → Serial Monitor
   - ตั้ง Baud Rate เป็น 115200
   - ตรวจสอบ output

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

### ฟังก์ชัน

- **Short Press (< 2 วินาที)**: บันทึกการออกห้อง
- **Long Press (> 2 วินาที)**: ซิงค์ข้อมูลออฟไลน์
- **Beep**: ส่งเสียงแจ้งเตือน
- **LED Blink**: แสดงสถานะ

### Backend API Connection

ESP32 Firmware เชื่อมต่อกับ Backend API ผ่าน HTTP POST:

```
POST http://your-backend-url.com:3000/api/trpc/mockESP32.recordOfflineExit
Content-Type: application/json

{
  "input": {
    "studentId": 6410101,
    "roomId": "room_101",
    "reason": "Offline exit button pressed",
    "timestamp": 1710761234567
  }
}
```

---

## 🐛 Troubleshooting

### Frontend Issues

**ปัญหา:** Offline Mode ไม่บันทึกข้อมูล

**แก้ไข:**
1. ตรวจสอบว่า IndexedDB ถูกเปิดใช้งาน
2. ตรวจสอบ Browser Console สำหรับ errors
3. ลบ IndexedDB และลองใหม่: DevTools → Application → IndexedDB → Delete

### Backend Issues

**ปัญหา:** Mock ESP32 API ไม่ตอบสนอง

**แก้ไข:**
1. ตรวจสอบว่า dev server กำลังทำงาน: `pnpm dev`
2. ตรวจสอบ URL ว่าถูกต้อง
3. ตรวจสอบ Network tab ใน DevTools

### ESP32 Issues

**ปัญหา:** ESP32 ไม่เชื่อมต่อ WiFi

**แก้ไข:**
1. ตรวจสอบ WIFI_SSID และ WIFI_PASSWORD
2. ตรวจสอบ Serial Monitor output
3. ลองรีเซ็ต ESP32

**ปัญหา:** ไม่สามารถอัพโหลด Firmware

**แก้ไข:**
1. ตรวจสอบ Port ที่ถูกต้อง
2. ลองใช้ USB Cable ที่ต่างออกไป
3. ลองรีเซ็ต ESP32 โดยกดปุ่ม Reset

---

## 📊 Database Schema

### ตารางหลัก

| ตาราง | คำอธิบาย |
|--------|---------|
| users | ผู้ใช้ระบบ (Admin) |
| students | ข้อมูลนักศึกษา |
| qrCodes | QR Code แบบไดนามิก |
| accessLogs | บันทึกการเข้าออก |
| doorSensors | สถานะเซ็นเซอร์ประตู |
| accessSchedules | ตั้งค่าเวลาเปิด-ปิด |
| reentryWindows | ตรวจสอบการเข้าใหม่ภายใน 5 นาที |
| webhookEvents | บันทึก Webhook Events |
| auditLogs | บันทึก Audit Logs |
| adminActivityLogs | บันทึก Admin Activity |
| offlineSyncQueue | คิวสำหรับซิงค์ข้อมูล |
| s3Backups | บันทึก S3 Backups |
| systemSettings | ตั้งค่าระบบ |

---

## 🧪 Testing

### Unit Tests

```bash
pnpm test
```

### Manual Testing

ดูไฟล์ `TESTING_GUIDE.md` สำหรับรายละเอียด

---

## 📁 โครงสร้างโปรเจกต์

```
door-access-system/
├── client/                    # Frontend (Next.js + React)
│   ├── src/
│   │   ├── pages/            # Page Components
│   │   ├── components/       # Reusable Components
│   │   └── lib/              # Utilities
│   └── public/               # Static Files
├── server/                    # Backend (Node.js + tRPC)
│   ├── routers/              # tRPC Routers
│   ├── db.ts                 # Database Queries
│   ├── qrCodeHelper.ts       # QR Code Generation
│   ├── webhookHelper.ts      # Webhook Notifications
│   └── auditLogHelper.ts     # Audit Log Helpers
├── ESP32_FIRMWARE/           # ESP32 Firmware
│   └── offline_exit_button.ino
├── drizzle/                  # Database Schema
│   ├── schema.ts
│   └── migrations/
├── storage/                  # S3 Storage Helpers
├── shared/                   # Shared Constants
├── SYSTEM_DESIGN.md         # System Design Document
├── TESTING_GUIDE.md         # Testing Guide
└── README.md                # This file
```

---

## 📝 License

MIT License - ดูไฟล์ LICENSE สำหรับรายละเอียด

---

## 👥 ผู้มีส่วนร่วม

- **Developer**: Puripong Saengchai
- **Organization**: Rajamangala University of Technology Phra Nakhon (RMUTP)
- **Faculty**: Faculty of Education

---

## 📞 ติดต่อ

- Email: support@example.com
- GitHub Issues: https://github.com/puripong1st/door-access-system-rmutk/issues
- Documentation: ดูไฟล์ `SYSTEM_DESIGN.md` และ `TESTING_GUIDE.md`

---

## 🙏 ขอบคุณ

- React 19 & Next.js
- Node.js & Express
- MySQL & Drizzle ORM
- tRPC
- Tailwind CSS
- shadcn/ui
- Arduino & ESP32

---

**ระบบนี้ถูกออกแบบและพัฒนาสำหรับมหาวิทยาลัยราชมงคลพระนคร คณะครุศาสตร์**

**Version:** 1.0.0  
**Last Updated:** 2026-03-18  
**Status:** ✅ Production Ready

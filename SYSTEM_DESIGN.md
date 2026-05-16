# ระบบควบคุมการเข้าออกห้องด้วย QR Code - เอกสารออกแบบระบบ

**สถาบัน:** มหาวิทยาลัยราชมงคลพระนคร คณะครุศาสตร์  
**วันที่:** มีนาคม 2026  
**เวอร์ชัน:** 1.0.0

---

## 1. ภาพรวมระบบ

ระบบควบคุมการเข้าออกห้องนี้ออกแบบมาเพื่อให้นักศึกษาสามารถเข้าออกห้องได้อย่างปลอดภัยและมีประสิทธิภาพ โดยใช้ QR Code แบบไดนามิก พร้อมระบบแจ้งเตือนแบบเรียลไทม์และการทำงานแม้ไม่มีอินเทอร์เน็ต

### 1.1 คุณสมบัติหลัก

- **QR Code แบบไดนามิก:** สร้าง QR Code ใหม่ทุกครั้ง ทำให้ QR เก่าไม่สามารถใช้ได้
- **โหมดออฟไลน์:** ระบบทำงานได้แม้ไวไฟขาดหรือไฟดับ โดยซิงค์ข้อมูลเมื่อกลับมาออนไลน์
- **ตรวจสอบเวลา:** ถ้าออกจากห้องไม่เกิน 5 นาที สามารถเข้าใหม่ได้ทันที
- **เซ็นเซอร์ประตู:** ตรวจสอบว่าประตูปิดสนิทหรือไม่ หากไม่สนิทจะมีเสียงแจ้งเตือน
- **ระบบแจ้งเตือน:** ส่งแจ้งเตือนผ่าน Webhook ไปยัง Line, Telegram, Email, Slack
- **ระบบฐานข้อมูล:** เก็บข้อมูลนักศึกษา ประวัติการเข้าออก ตั้งค่าระบบ
- **S3 Backup:** เก็บรูปภาพ log files และข้อมูลสำรองบน Amazon S3

---

## 2. สถาปัตยกรรมระบบ

### 2.1 โครงสร้างเลเยอร์

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (Next.js + React)            │
│  - Student Access Page (QR Scanning)                    │
│  - Admin Dashboard (Settings, Reports)                  │
│  - PWA Support (Offline Mode)                           │
└──────────────────────┬──────────────────────────────────┘
                       │ tRPC / HTTP
┌──────────────────────▼──────────────────────────────────┐
│                 Backend (Node.js + tRPC)                │
│  - QR Code Generation & Validation                      │
│  - Access Control Logic                                 │
│  - Webhook Notifications                                │
│  - S3 Integration                                       │
└──────────────────────┬──────────────────────────────────┘
                       │ SQL
┌──────────────────────▼──────────────────────────────────┐
│              Database (MySQL / TiDB)                    │
│  - Students, AccessLogs, QRCodes                        │
│  - DoorSensors, Settings, Webhooks                      │
└─────────────────────────────────────────────────────────┘
```

### 2.2 ส่วนประกอบหลัก

| ส่วนประกอบ | เทคโนโลยี | หน้าที่ |
|-----------|---------|--------|
| Frontend | Next.js 19 + React | UI สำหรับนักศึกษาและแอดมิน |
| Backend API | Node.js + tRPC | ประมวลผล Business Logic |
| Database | MySQL | เก็บข้อมูลทั้งหมด |
| QR Generation | qrcode library | สร้าง QR Code แบบไดนามิก |
| Notifications | Axios + Webhooks | ส่งแจ้งเตือนไปยัง Line/Telegram |
| Storage | AWS S3 | เก็บรูปภาพและ Backups |
| Offline Support | Service Worker + IndexedDB | ทำงานเมื่อไม่มีอินเทอร์เน็ต |

---

## 3. ฐานข้อมูล

### 3.1 ตารางหลัก

#### Students (นักศึกษา)
```sql
- id (PK)
- studentId (UNIQUE) - รหัสนักศึกษา
- firstName, lastName
- email, phone
- year (1-4) - ชั้นปี
- branch - สาขาที่เรียน
- status (active/inactive/graduated)
- profileImage - URL ไปยัง S3
- createdAt, updatedAt
```

#### QRCodes (QR Code แบบไดนามิก)
```sql
- id (PK)
- code (UNIQUE) - Token ที่ไม่ซ้ำกัน
- studentId (FK)
- isActive - สถานะการใช้งาน
- expiresAt - เวลาหมดอายุ
- usedAt - เวลาที่ใช้งาน
- createdAt, updatedAt
```

#### AccessLogs (บันทึกการเข้าออก)
```sql
- id (PK)
- studentId (FK)
- roomId - ห้องที่เข้า
- accessType (entry/exit)
- timestamp - เวลาที่เข้า/ออก
- qrCodeId (FK)
- status (success/failed/warning)
- isOfflineSync - ข้อมูลจากออฟไลน์
- createdAt
```

#### DoorSensors (เซ็นเซอร์ประตู)
```sql
- id (PK)
- roomId (UNIQUE)
- roomName
- sensorStatus (open/closed/error)
- lastStatusChange
- alertEnabled
- alertSoundUrl - S3 URL
- createdAt, updatedAt
```

#### AccessSchedules (ตั้งเวลาเปิด-ปิด)
```sql
- id (PK)
- roomId
- dayOfWeek (0-6)
- startTime (HH:mm)
- endTime (HH:mm)
- isEnabled
- createdAt, updatedAt
```

#### ReentryWindows (ตรวจสอบการเข้าใหม่ภายใน 5 นาที)
```sql
- id (PK)
- studentId (FK)
- roomId
- lastExitTime
- windowExpiresAt (หมดอายุหลังจาก 5 นาที)
- createdAt
```

#### WebhookEvents (บันทึก Webhook Events)
```sql
- id (PK)
- eventType
- studentId (FK)
- roomId
- data (JSON)
- webhookUrl
- webhookType (line/telegram/email/slack)
- status (pending/sent/failed)
- retryCount
- lastError
- sentAt
- createdAt
```

#### OfflineSyncQueue (คิวสำหรับซิงค์ข้อมูลออฟไลน์)
```sql
- id (PK)
- dataType
- data (JSON)
- deviceId
- syncedAt
- status (pending/synced/failed)
- createdAt
```

#### S3Backups (บันทึก S3 Backups)
```sql
- id (PK)
- backupType (logs/images/database)
- s3Key
- s3Url
- fileSize
- status (completed/failed)
- createdAt
```

#### NotificationSettings (ตั้งค่าการแจ้งเตือน)
```sql
- id (PK)
- adminId (FK)
- notificationType (email/line/telegram/slack)
- webhookUrl
- isEnabled
- eventTypes (JSON array)
- createdAt, updatedAt
```

#### SystemSettings (ตั้งค่าระบบ)
```sql
- id (PK)
- key (UNIQUE)
- value (JSON)
- description
- updatedAt
```

---

## 4. API Endpoints (tRPC)

### 4.1 Students Router

```typescript
// ดึงรายชื่อนักศึกษาทั้งหมด
trpc.students.list.useQuery()

// ค้นหานักศึกษาตามรหัส
trpc.students.getById.useQuery({ studentId: string })

// สร้างนักศึกษาใหม่
trpc.students.create.useMutation({
  studentId, firstName, lastName, email, phone, year, branch
})

// ดึงประวัติการเข้าออก
trpc.students.getAccessLogs.useQuery({ studentId, limit })
```

### 4.2 Access Router

```typescript
// สร้าง QR Code แบบไดนามิก
trpc.access.generateQRCode.useMutation({ studentId })
// Returns: { token, qrImage, expiresAt }

// ตรวจสอบและบันทึกการเข้าห้อง
trpc.access.verifyAndRecordAccess.useMutation({
  qrCode, roomId, accessType, deviceInfo
})
// Returns: { success, student, accessType, timestamp }

// ตรวจสอบสถานะประตู
trpc.access.getDoorStatus.useQuery({ roomId })
// Returns: { roomId, roomName, status, lastStatusChange, alertEnabled }

// อัพเดตสถานะประตู (จาก ESP32)
trpc.access.updateDoorStatus.useMutation({ roomId, status })
```

### 4.3 Admin Router

```typescript
// ดึงตั้งค่าระบบ
trpc.admin.getSettings.useQuery()
// Returns: { qrExpirationMinutes, reentryWindowMinutes, doorAlertEnabled, webhookRetryCount }

// อัพเดตตั้งค่า
trpc.admin.updateSettings.useMutation({
  qrExpirationMinutes, reentryWindowMinutes, doorAlertEnabled, webhookRetryCount
})

// ตั้งเวลาเปิด-ปิด
trpc.admin.setAccessSchedule.useMutation({
  roomId, dayOfWeek, startTime, endTime
})

// ดึงเวลาเปิด-ปิด
trpc.admin.getAccessSchedules.useQuery({ roomId })

// ทดสอบเสียงแจ้งเตือน
trpc.admin.testDoorAlert.useMutation({ roomId })
```

---

## 5. ขั้นตอนการทำงาน

### 5.1 ขั้นตอนการเข้าห้อง

```
1. นักศึกษาเปิดแอปพลิเคชัน
   ↓
2. กด "สร้าง QR Code"
   ↓
3. ระบบสร้าง QR Code ใหม่ (หมดอายุใน 15 นาที)
   ↓
4. นักศึกษาสแกน QR Code ด้วยกล้อง ESP32
   ↓
5. ESP32 ส่ง QR Code ไปยัง Backend
   ↓
6. Backend ตรวจสอบ QR Code
   - ตรวจสอบว่า QR Code ยังใช้ได้
   - ตรวจสอบว่าไม่หมดอายุ
   - ตรวจสอบ Re-entry Window (ถ้าเป็นการเข้าใหม่)
   ↓
7. ถ้าผ่านการตรวจสอบ
   - บันทึกการเข้าห้องลงฐานข้อมูล
   - ทำให้ QR Code เก่าไม่สามารถใช้ได้
   - ส่งแจ้งเตือนไปยัง Admin
   ↓
8. ESP32 เปิดประตู
```

### 5.2 ขั้นตอนการออกจากห้อง

```
1. นักศึกษากด "ออกจากห้อง"
   ↓
2. ระบบบันทึกการออกห้อง
   ↓
3. สร้าง Re-entry Window (5 นาที)
   - ในช่วง 5 นาทีนี้ นักศึกษาสามารถเข้าห้องได้ทันที
   - หลังจาก 5 นาที ต้องสร้าง QR Code ใหม่
   ↓
4. ส่งแจ้งเตือนไปยัง Admin
```

### 5.3 ขั้นตอนการทำงานแบบออฟไลน์

```
1. เมื่อไวไฟขาด
   ↓
2. Frontend ใช้ IndexedDB เก็บข้อมูลการเข้าออก
   ↓
3. เก็บข้อมูลไว้ในคิว (Offline Sync Queue)
   ↓
4. เมื่อกลับมาออนไลน์
   ↓
5. Frontend ส่งข้อมูลทั้งหมดไปยัง Backend
   ↓
6. Backend ตรวจสอบและบันทึกข้อมูล
   ↓
7. ทำเครื่องหมายว่าข้อมูลได้ซิงค์แล้ว
```

---

## 6. ระบบแจ้งเตือน

### 6.1 ประเภท Events

| Event | ความรุนแรง | ผู้รับ | ช่องทาง |
|-------|----------|------|--------|
| Door Not Closed | 🚨 Error | Admin | Line, Telegram, Email |
| Unauthorized Access | 🚨 Error | Admin | Line, Telegram, Email |
| Student Entry | ℹ️ Info | Admin | Line, Telegram |
| Student Exit | ℹ️ Info | Admin | Line, Telegram |
| QR Code Expired | ⚠️ Warning | Admin | Line, Telegram |
| System Error | 🚨 Error | Admin | Email |

### 6.2 Webhook Integration

```typescript
// Line Notification
POST https://api.line.biz/v2/bot/message/push
{
  "to": "userId",
  "messages": [{
    "type": "text",
    "text": "🚨 ประตูห้อง 101 ไม่ปิดสนิท\nเวลา: 2026-03-18 15:30:45"
  }]
}

// Telegram Notification
POST https://api.telegram.org/botXXX/sendMessage
{
  "chat_id": "chatId",
  "text": "<b>🚨 ประตูห้อง 101 ไม่ปิดสนิท</b>\n<b>เวลา:</b> 2026-03-18 15:30:45",
  "parse_mode": "HTML"
}
```

---

## 7. ความปลอดภัย

### 7.1 การป้องกัน

- **QR Code Expiration:** QR Code หมดอายุใน 15 นาที
- **QR Code One-time Use:** ใช้ได้เพียงครั้งเดียว
- **Re-entry Window:** ป้องกันการเข้าห้องซ้ำ ๆ ในเวลาสั้น ๆ
- **JWT Authentication:** ใช้ JWT สำหรับการยืนยันตัวตน
- **HTTPS Only:** ทุกการสื่อสารใช้ HTTPS
- **Rate Limiting:** จำกัดจำนวนการร้องขอต่อหน่วยเวลา
- **Input Validation:** ตรวจสอบข้อมูลทั้งหมดก่อนประมวลผล

### 7.2 การป้องกันข้อมูล

- **Encryption:** เข้ารหัสข้อมูลที่ไวต่อในฐานข้อมูล
- **S3 Backup:** เก็บสำรองข้อมูลบน S3
- **Access Control:** ควบคุมการเข้าถึงข้อมูลตามบทบาท (Admin/User)
- **Audit Logs:** บันทึกทุกการกระทำที่สำคัญ

---

## 8. Raspberry Pi Setup

### 8.1 ข้อกำหนดฮาร์ดแวร์

| ส่วนประกอบ | รุ่น | หน้าที่ |
|-----------|-----|--------|
| Raspberry Pi | 4B (4GB RAM) | Server หลัก |
| ESP32 | DevKit | QR Scanner + Door Control |
| Door Sensor | Magnetic Switch | ตรวจสอบประตูปิด/เปิด |
| Buzzer | 5V | เสียงแจ้งเตือน |
| Power Supply | 5V 3A | จ่ายไฟ |
| SD Card | 64GB | เก็บ OS |

### 8.2 การติดตั้ง

```bash
# 1. ติดตั้ง OS
- ดาวน์โหลด Raspberry Pi OS
- เขียนลงใน SD Card

# 2. ติดตั้ง Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone Repository
git clone <repo-url>
cd door-access-system

# 4. ติดตั้ง Dependencies
pnpm install

# 5. ตั้งค่า Environment Variables
cp .env.example .env
# แก้ไข .env ตามความต้องการ

# 6. รัน Database Migration
pnpm db:push

# 7. เริ่มต้นเซิร์ฟเวอร์
pnpm start
```

---

## 9. ESP32 Firmware

### 9.1 ขั้นตอนการทำงาน

```cpp
1. เริ่มต้น WiFi Connection
   ↓
2. เปิดใช้งาน Camera
   ↓
3. ตรวจสอบ QR Code ผ่านกล้อง
   ↓
4. ส่ง QR Code ไปยัง Backend
   ↓
5. รับการตอบกลับจาก Backend
   ↓
6. ถ้าสำเร็จ → เปิดประตู + เสียงสำเร็จ
   ถ้าล้มเหลว → เสียงแจ้งเตือน
```

### 9.2 Libraries ที่ใช้

- **ESP32-CAM:** Camera support
- **WiFi:** WiFi connectivity
- **HTTPClient:** HTTP requests
- **ArduinoJson:** JSON parsing

---

## 10. Offline Mode

### 10.1 Data Storage

```typescript
// IndexedDB Schema
{
  stores: {
    accessLogs: {
      keyPath: 'id',
      indexes: ['studentId', 'roomId', 'timestamp']
    },
    qrCodes: {
      keyPath: 'id',
      indexes: ['code', 'studentId']
    },
    syncQueue: {
      keyPath: 'id',
      indexes: ['status', 'createdAt']
    }
  }
}
```

### 10.2 Sync Strategy

```
1. เมื่อออฟไลน์
   - เก็บข้อมูลใน IndexedDB
   - แสดง "Offline Mode" ให้ผู้ใช้ทราบ

2. เมื่อออนไลน์กลับมา
   - ตรวจสอบข้อมูลใน Sync Queue
   - ส่งข้อมูลไปยัง Backend ทีละรายการ
   - ตรวจสอบการตอบกลับ
   - ถ้าสำเร็จ → ลบออกจาก Queue
   - ถ้าล้มเหลว → เก็บไว้ลองใหม่

3. Retry Logic
   - ลองใหม่สูงสุด 3 ครั้ง
   - รอ 5 วินาทีก่อนลองใหม่
```

---

## 11. S3 Integration

### 11.1 Backup Strategy

```
Daily Backup (เวลา 00:00 UTC)
├── Database Dump
│   └── s3://bucket/backups/db/YYYY-MM-DD.sql
├── Access Logs
│   └── s3://bucket/backups/logs/YYYY-MM-DD.json
└── Images
    └── s3://bucket/backups/images/YYYY-MM-DD.tar.gz
```

### 11.2 File Organization

```
s3://door-access-bucket/
├── students/
│   ├── {studentId}/profile.jpg
│   └── {studentId}/documents/
├── qr-codes/
│   ├── {qrCodeId}.png
│   └── {qrCodeId}.json
├── backups/
│   ├── db/
│   ├── logs/
│   └── images/
└── alerts/
    ├── door-not-closed/
    └── unauthorized-access/
```

---

## 12. Monitoring & Logging

### 12.1 Logs

```
Location: .manus-logs/
├── devserver.log - Server startup, Vite HMR
├── browserConsole.log - Client-side console
├── networkRequests.log - HTTP requests
└── sessionReplay.log - User interactions
```

### 12.2 Metrics

- QR Code generation rate
- Access success/failure rate
- Door alert frequency
- Webhook delivery rate
- Offline sync success rate

---

## 13. Deployment

### 13.1 Production Checklist

- [ ] ตั้งค่า Environment Variables
- [ ] ตั้งค่า Database
- [ ] ตั้งค่า S3 Bucket
- [ ] ตั้งค่า Webhook URLs
- [ ] ตั้งค่า SSL Certificate
- [ ] ทดสอบ QR Code Generation
- [ ] ทดสอบ Webhook Notifications
- [ ] ทดสอบ Offline Mode
- [ ] ทดสอบ S3 Backup
- [ ] ทดสอบ Door Sensor
- [ ] ทดสอบ ESP32 Integration

### 13.2 Performance Optimization

- Caching: ใช้ Redis สำหรับ caching
- CDN: ใช้ CloudFront สำหรับ S3
- Database: ใช้ Index สำหรับ queries
- API: ใช้ pagination สำหรับ large datasets

---

## 14. Troubleshooting

### 14.1 QR Code Issues

**ปัญหา:** QR Code ไม่สแกนได้
- **วิธีแก้:** ตรวจสอบคุณภาพของ QR Code, ทำความสะอาดกล้อง

**ปัญหา:** QR Code หมดอายุเร็ว
- **วิธีแก้:** เพิ่มเวลา expiration ใน settings

### 14.2 Offline Mode Issues

**ปัญหา:** ข้อมูลไม่ซิงค์
- **วิธีแก้:** ตรวจสอบ IndexedDB, ลองรีเซ็ต browser cache

**ปัญหา:** Sync Queue เต็ม
- **วิธีแก้:** ลบข้อมูลเก่า, เพิ่ม storage capacity

### 14.3 Door Sensor Issues

**ปัญหา:** Sensor ไม่ตอบสนอง
- **วิธีแก้:** ตรวจสอบการเชื่อมต่อ, ทดสอบ sensor

**ปัญหา:** False Alerts
- **วิธีแก้:** ปรับ sensitivity, ตรวจสอบ calibration

---

## 15. Future Enhancements

- [ ] Facial Recognition Integration
- [ ] Mobile App (iOS/Android)
- [ ] Real-time Analytics Dashboard
- [ ] Machine Learning for Anomaly Detection
- [ ] Multi-language Support
- [ ] Voice Notifications
- [ ] Integration with Student Management System
- [ ] Biometric Authentication

---

## 16. Support & Contact

สำหรับคำถามหรือปัญหา โปรดติดต่อ:
- **Email:** support@example.com
- **Phone:** +66-X-XXXX-XXXX
- **Website:** https://example.com

---

**เอกสารนี้อยู่ภายใต้ลิขสิทธิ์ © 2026 มหาวิทยาลัยราชมงคลพระนคร**

# 📚 อธิบายโค้ดระบบควบคุมการเข้าออกห้องเรียน

## 🎯 สารบัญ
1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Backend API (tRPC)](#backend-api-trpc)
4. [Frontend Components](#frontend-components)
5. [ESP32 Firmware](#esp32-firmware)
6. [Helper Functions](#helper-functions)
7. [Audit Log System](#audit-log-system)
8. [Offline Mode](#offline-mode)

---

## Architecture Overview

### 🏗️ ระบบโดยรวม

```
┌─────────────────────────────────────────────────────────────┐
│                    Raspberry Pi 4B (Server)                  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Node.js + Express + tRPC (Backend API)              │  │
│  │  - Port 3000                                         │  │
│  │  - Vite Dev Server (Frontend)                        │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  MySQL Database                                      │  │
│  │  - 12 Tables (Students, QRCodes, Logs, etc.)        │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↕ WiFi (HTTP/REST)
┌─────────────────────────────────────────────────────────────┐
│              ESP32 (ติดตั้งที่ประตู)                        │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - LCD 2.4" TFT Touch Screen (แสดง QR Code)         │  │
│  │  - 2 Channel Relay Module (ควบคุม Magnetic Lock)    │  │
│  │  - Buzzer (แจ้งเตือนเสียง)                           │  │
│  │  - Door Sensor (ตรวจสอบประตูปิด)                    │  │
│  │  - Push Button (ปุ่มออฟไลน์โหมด)                    │  │
│  │  - SPIFFS Storage (เก็บข้อมูลออฟไลน์)               │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         ↕ WiFi (HTTP/REST)
┌─────────────────────────────────────────────────────────────┐
│         Student/Admin (Web Browser)                          │
│  - QR Code Scanning                                         │
│  - Admin Dashboard                                          │
│  - Settings Management                                      │
└─────────────────────────────────────────────────────────────┘
```

### 📊 Data Flow

```
1. Student Access Flow:
   Student → Web Browser → Scan QR Code → Backend API
   → Verify QR Code → Check Access Permission
   → Record Access Log → Send Webhook Notification
   → ESP32 receives command → Unlock Door → Buzzer Alert

2. Offline Mode Flow:
   Student → Press Offline Button → Store in IndexedDB
   → When WiFi back → Sync to Backend → Record in DB
   → Send Webhook Notification

3. Admin Approval Flow:
   Admin → Web Browser → Approve Access → Backend API
   → Create Access Approval → Record Audit Log
   → Send Webhook to Admin
```

---

## Database Schema

### 📋 ตารางทั้งหมด (12 ตาราง)

#### 1️⃣ **users** - ข้อมูลผู้ใช้ (Admin)
```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  openId VARCHAR(64) UNIQUE NOT NULL,      -- Manus OAuth ID
  name TEXT,                               -- ชื่อแอดมิน
  email VARCHAR(320),                      -- อีเมล
  loginMethod VARCHAR(64),                 -- วิธีเข้าสู่ระบบ
  role ENUM('user', 'admin') DEFAULT 'user', -- สิทธิ์
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  lastSignedIn TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** ตรวจสอบสิทธิ์ Admin, บันทึก Audit Log

---

#### 2️⃣ **students** - ข้อมูลนักศึกษา
```sql
CREATE TABLE students (
  id INT PRIMARY KEY AUTO_INCREMENT,
  studentId INT UNIQUE NOT NULL,           -- รหัสนักศึกษา (6410101)
  firstName VARCHAR(255) NOT NULL,         -- ชื่อ
  lastName VARCHAR(255) NOT NULL,          -- นามสกุล
  year INT,                                -- ชั้นปี (1-4)
  major VARCHAR(255),                      -- สาขาวิชา
  roomId VARCHAR(50),                      -- ห้องที่ลงทะเบียน
  isActive BOOLEAN DEFAULT TRUE,           -- สถานะการใช้งาน
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** ตรวจสอบตัวตนนักศึกษา, บันทึกข้อมูลส่วนตัว

---

#### 3️⃣ **qrCodes** - QR Code แบบไดนามิก
```sql
CREATE TABLE qrCodes (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(255) UNIQUE NOT NULL,       -- QR Code Token (UUID)
  roomId VARCHAR(50) NOT NULL,             -- ห้องที่สร้าง QR
  generatedBy INT,                         -- Admin ID ที่สร้าง
  generatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expiresAt TIMESTAMP,                     -- หมดอายุเมื่อ
  isUsed BOOLEAN DEFAULT FALSE,            -- ใช้แล้วหรือยัง
  usedBy INT,                              -- นักศึกษา ID ที่ใช้
  usedAt TIMESTAMP,                        -- เวลาที่ใช้
  isValid BOOLEAN DEFAULT TRUE             -- ยังใช้ได้หรือไม่
);
```
**ใช้สำหรับ:** สร้าง QR Code ใหม่ทุกครั้ง, ตรวจสอบ QR Code ที่ใช้แล้ว

---

#### 4️⃣ **accessLogs** - บันทึกการเข้าออก
```sql
CREATE TABLE accessLogs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  studentId INT NOT NULL,                  -- นักศึกษา
  roomId VARCHAR(50) NOT NULL,             -- ห้อง
  accessType ENUM('entry', 'exit') NOT NULL, -- เข้า/ออก
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  method ENUM('qr_code', 'offline_button', 'admin_approval', 'auto_unlock') NOT NULL,
  ipAddress VARCHAR(45),                   -- IP Address
  deviceInfo TEXT,                         -- ข้อมูล Device
  approvedBy INT,                          -- Admin ID ที่อนุญาติ (ถ้ามี)
  notes TEXT                               -- หมายเหตุ
);
```
**ใช้สำหรับ:** บันทึกทุกการเข้าออก, ตรวจสอบประวัติ

---

#### 5️⃣ **doorSensors** - สถานะเซ็นเซอร์ประตู
```sql
CREATE TABLE doorSensors (
  id INT PRIMARY KEY AUTO_INCREMENT,
  roomId VARCHAR(50) UNIQUE NOT NULL,      -- ห้อง
  sensorStatus ENUM('open', 'closed') DEFAULT 'closed',
  lastUpdated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  isAlertActive BOOLEAN DEFAULT FALSE,     -- มีการแจ้งเตือน
  alertTriggeredAt TIMESTAMP               -- เวลาแจ้งเตือน
);
```
**ใช้สำหรับ:** ตรวจสอบประตูปิดสนิท, แจ้งเตือนเมื่อประตูไม่ปิด

---

#### 6️⃣ **accessSchedules** - ตั้งเวลาเปิด-ปิด
```sql
CREATE TABLE accessSchedules (
  id INT PRIMARY KEY AUTO_INCREMENT,
  roomId VARCHAR(50) NOT NULL,             -- ห้อง
  dayOfWeek INT,                           -- วันในสัปดาห์ (0=Sun, 6=Sat)
  startTime TIME,                          -- เวลาเปิด (00:00-23:59)
  endTime TIME,                            -- เวลาปิด (00:00-23:59)
  isActive BOOLEAN DEFAULT TRUE,           -- เปิดใช้งาน
  createdBy INT,                           -- Admin ที่สร้าง
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** เปิด-ปิดประตูอัตโนมัติตามเวลา

---

#### 7️⃣ **reentryWindows** - ตรวจสอบการเข้าใหม่ภายใน 5 นาที
```sql
CREATE TABLE reentryWindows (
  id INT PRIMARY KEY AUTO_INCREMENT,
  studentId INT NOT NULL,                  -- นักศึกษา
  roomId VARCHAR(50) NOT NULL,             -- ห้อง
  exitTime TIMESTAMP,                      -- เวลาออก
  windowExpiresAt TIMESTAMP,               -- หมดอายุหลังจาก 5 นาที
  isActive BOOLEAN DEFAULT TRUE            -- ยังใช้ได้หรือไม่
);
```
**ใช้สำหรับ:** อนุญาติให้เข้าห้องใหม่ได้โดยไม่ต้องสแกน QR ใหม่ (ภายใน 5 นาที)

---

#### 8️⃣ **webhookEvents** - บันทึก Webhook Events
```sql
CREATE TABLE webhookEvents (
  id INT PRIMARY KEY AUTO_INCREMENT,
  eventType VARCHAR(50) NOT NULL,          -- ประเภท Event
  roomId VARCHAR(50),                      -- ห้อง
  studentId INT,                           -- นักศึกษา (ถ้ามี)
  adminId INT,                             -- Admin (ถ้ามี)
  message TEXT NOT NULL,                   -- ข้อความ
  webhookUrl TEXT,                         -- URL ที่ส่ง
  webhookProvider ENUM('line', 'telegram', 'slack', 'email') NOT NULL,
  status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  sentAt TIMESTAMP,                        -- เวลาส่ง
  errorMessage TEXT,                       -- ข้อความ Error
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** บันทึกการส่ง Webhook ไปยัง Line, Telegram, Email

---

#### 9️⃣ **notificationSettings** - ตั้งค่าการแจ้งเตือน
```sql
CREATE TABLE notificationSettings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  adminId INT NOT NULL,                    -- Admin
  notificationType VARCHAR(50),            -- ประเภท (door_alert, access_approval, etc.)
  webhookProvider ENUM('line', 'telegram', 'slack', 'email'),
  webhookUrl TEXT,                         -- URL สำหรับส่ง
  isEnabled BOOLEAN DEFAULT TRUE,          -- เปิดใช้งาน
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** ตั้งค่าวิธีการแจ้งเตือนของแต่ละ Admin

---

#### 🔟 **offlineSyncQueue** - คิวสำหรับซิงค์ข้อมูลออฟไลน์
```sql
CREATE TABLE offlineSyncQueue (
  id INT PRIMARY KEY AUTO_INCREMENT,
  deviceId VARCHAR(255),                   -- Device ID (ESP32/Browser)
  actionType VARCHAR(50),                  -- ประเภท Action (exit, entry, etc.)
  actionData JSON,                         -- ข้อมูล Action (JSON)
  isSynced BOOLEAN DEFAULT FALSE,          -- ซิงค์แล้วหรือยัง
  syncedAt TIMESTAMP,                      -- เวลาซิงค์
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** เก็บข้อมูลออฟไลน์ไว้ซิงค์ภายหลัง

---

#### 1️⃣1️⃣ **s3Backups** - บันทึก S3 Backups
```sql
CREATE TABLE s3Backups (
  id INT PRIMARY KEY AUTO_INCREMENT,
  backupType VARCHAR(50),                  -- ประเภท (logs, images, database)
  s3Key VARCHAR(255),                      -- Key ใน S3
  s3Url TEXT,                              -- URL ใน S3
  fileSize BIGINT,                         -- ขนาดไฟล์
  backupDate DATE,                         -- วันที่ Backup
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** บันทึกไฟล์ที่อัพโหลดขึ้น S3

---

#### 1️⃣2️⃣ **systemSettings** - ตั้งค่าระบบ
```sql
CREATE TABLE systemSettings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  settingKey VARCHAR(100) UNIQUE NOT NULL, -- ชื่อตั้งค่า
  settingValue TEXT,                       -- ค่า
  description TEXT,                        -- คำอธิบาย
  updatedBy INT,                           -- Admin ที่แก้ไข
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```
**ใช้สำหรับ:** เก็บตั้งค่าระบบ (QR expiry time, reentry window, etc.)

---

### 🔑 Relationships (ความสัมพันธ์)

```
users (Admin)
  ├─ qrCodes (generatedBy)
  ├─ accessSchedules (createdBy)
  ├─ webhookEvents (adminId)
  ├─ notificationSettings (adminId)
  ├─ accessLogs (approvedBy)
  └─ systemSettings (updatedBy)

students
  ├─ accessLogs (studentId)
  ├─ reentryWindows (studentId)
  └─ qrCodes (usedBy)

qrCodes
  └─ accessLogs (QR Code Token)

rooms (implicit)
  ├─ qrCodes (roomId)
  ├─ accessLogs (roomId)
  ├─ doorSensors (roomId)
  ├─ accessSchedules (roomId)
  └─ reentryWindows (roomId)
```

---

## Backend API (tRPC)

### 📡 tRPC Procedures

#### 🎯 **students Router** - จัดการข้อมูลนักศึกษา

##### `students.list`
```typescript
// ดึงรายชื่อนักศึกษาทั้งหมด
// Input: ไม่มี
// Output: Student[]
// ตัวอย่าง:
// [
//   { id: 1, studentId: 6410101, firstName: "สมชาย", lastName: "ใจดี", ... },
//   { id: 2, studentId: 6410102, firstName: "ปัญญา", lastName: "ฉลาด", ... }
// ]
```

##### `students.getById`
```typescript
// ค้นหานักศึกษาตามรหัส
// Input: { studentId: 6410101 }
// Output: Student | null
// ตัวอย่าง:
// { id: 1, studentId: 6410101, firstName: "สมชาย", lastName: "ใจดี", year: 3, major: "วิทยาศาสตร์คอมพิวเตอร์" }
```

##### `students.create`
```typescript
// สร้างนักศึกษาใหม่
// Input: { studentId: 6410101, firstName: "สมชาย", lastName: "ใจดี", year: 3, major: "วิทยาศาสตร์คอมพิวเตอร์", roomId: "room_101" }
// Output: { success: true, student: Student }
// ตัวอย่าง:
// { success: true, student: { id: 1, studentId: 6410101, ... } }
```

##### `students.getAccessLogs`
```typescript
// ดึงประวัติการเข้าออกของนักศึกษา
// Input: { studentId: 6410101, limit: 50 }
// Output: AccessLog[]
// ตัวอย่าง:
// [
//   { id: 1, studentId: 6410101, roomId: "room_101", accessType: "entry", timestamp: "2026-03-18 14:30:00", method: "qr_code" },
//   { id: 2, studentId: 6410101, roomId: "room_101", accessType: "exit", timestamp: "2026-03-18 15:45:00", method: "offline_button" }
// ]
```

---

#### 🎯 **access Router** - ควบคุมการเข้าออก

##### `access.generateQRCode`
```typescript
// สร้าง QR Code แบบไดนามิก
// Input: { roomId: "room_101" }
// Output: { qrCode: string, expiresAt: Date, token: string }
// ตัวอย่าง:
// {
//   qrCode: "data:image/png;base64,iVBORw0KGgo...",
//   expiresAt: "2026-03-18 14:35:00",
//   token: "550e8400-e29b-41d4-a716-446655440000"
// }
// 
// ขั้นตอนการทำงาน:
// 1. สร้าง UUID token ใหม่
// 2. บันทึกลงตาราง qrCodes
// 3. สร้างรูปภาพ QR Code จาก token
// 4. ตั้งเวลาหมดอายุ (5 นาที)
// 5. ส่งกลับรูปภาพและข้อมูล
```

##### `access.verifyAndRecordAccess`
```typescript
// ตรวจสอบและบันทึกการเข้าห้อง
// Input: { qrCodeToken: "550e8400-...", studentId: 6410101, roomId: "room_101" }
// Output: { success: boolean, message: string, doorUnlocked: boolean }
// ตัวอย่าง:
// { success: true, message: "เข้าห้องสำเร็จ", doorUnlocked: true }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบ QR Code Token ว่าใช้ได้หรือไม่
// 2. ตรวจสอบว่า QR Code ยังไม่หมดอายุ
// 3. ตรวจสอบว่า QR Code ยังไม่ถูกใช้แล้ว
// 4. ตรวจสอบสิทธิ์นักศึกษา
// 5. บันทึกลงตาราง accessLogs
// 6. ส่งคำสั่งไปยัง ESP32 เพื่อเปิดประตู
// 7. ส่ง Webhook notification
// 8. สร้าง reentry window (5 นาที)
// 9. ส่งกลับผลลัพธ์
```

##### `access.getDoorStatus`
```typescript
// ตรวจสอบสถานะประตู
// Input: { roomId: "room_101" }
// Output: { roomId: string, status: "open" | "closed", lastUpdated: Date }
// ตัวอย่าง:
// { roomId: "room_101", status: "closed", lastUpdated: "2026-03-18 14:30:00" }
```

##### `access.updateDoorStatus`
```typescript
// อัพเดตสถานะประตู (จาก ESP32)
// Input: { roomId: "room_101", status: "open" | "closed" }
// Output: { success: boolean }
// ตัวอย่าง:
// { success: true }
//
// ขั้นตอนการทำงาน:
// 1. อัพเดตตาราง doorSensors
// 2. ถ้าประตูไม่ปิดสนิท → ส่ง Webhook alert
// 3. ส่งกลับผลลัพธ์
```

---

#### 🎯 **admin Router** - ตั้งค่าระบบ

##### `admin.getSettings`
```typescript
// ดึงตั้งค่าระบบ
// Input: ไม่มี
// Output: SystemSettings[]
// ตัวอย่าง:
// [
//   { settingKey: "qr_expiry_minutes", settingValue: "5", description: "เวลาหมดอายุ QR Code (นาที)" },
//   { settingKey: "reentry_window_minutes", settingValue: "5", description: "เวลาอนุญาติเข้าใหม่ (นาที)" }
// ]
```

##### `admin.updateSettings`
```typescript
// อัพเดตตั้งค่าระบบ
// Input: { settingKey: "qr_expiry_minutes", settingValue: "10" }
// Output: { success: boolean, setting: SystemSettings }
// ตัวอย่าง:
// { success: true, setting: { settingKey: "qr_expiry_minutes", settingValue: "10" } }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Admin
// 2. อัพเดตตาราง systemSettings
// 3. บันทึก Audit Log
// 4. ส่ง Webhook notification
// 5. ส่งกลับผลลัพธ์
```

##### `admin.setAccessSchedule`
```typescript
// ตั้งเวลาเปิด-ปิดห้อง
// Input: { roomId: "room_101", dayOfWeek: 1, startTime: "08:00", endTime: "17:00" }
// Output: { success: boolean, schedule: AccessSchedule }
// ตัวอย่าง:
// { success: true, schedule: { roomId: "room_101", dayOfWeek: 1, startTime: "08:00", endTime: "17:00" } }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Admin
// 2. บันทึกลงตาราง accessSchedules
// 3. บันทึก Audit Log
// 4. ส่ง Webhook notification
// 5. ส่งกลับผลลัพธ์
```

##### `admin.testDoorAlert`
```typescript
// ทดสอบเสียงแจ้งเตือน
// Input: { roomId: "room_101" }
// Output: { success: boolean, message: string }
// ตัวอย่าง:
// { success: true, message: "ส่งคำสั่งทดสอบไปยัง ESP32 สำเร็จ" }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Admin
// 2. ส่งคำสั่ง HTTP POST ไปยัง ESP32
// 3. ESP32 เล่นเสียง Buzzer
// 4. บันทึก Audit Log
// 5. ส่งกลับผลลัพธ์
```

---

#### 🎯 **adminManagement Router** - จัดการแอดมินหลายคน

##### `adminManagement.list`
```typescript
// ดึงรายชื่อแอดมินทั้งหมด
// Input: ไม่มี
// Output: AdminRole[]
// ตัวอย่าง:
// [
//   { id: 1, adminId: 1, role: "super_admin", permissions: [...], createdAt: "2026-03-18 10:00:00" },
//   { id: 2, adminId: 2, role: "admin", permissions: [...], createdAt: "2026-03-18 11:00:00" }
// ]
```

##### `adminManagement.create`
```typescript
// สร้างแอดมินใหม่
// Input: { adminId: 2, role: "admin", permissions: ["access_approval", "view_logs"] }
// Output: { success: boolean, adminRole: AdminRole }
// ตัวอย่าง:
// { success: true, adminRole: { id: 2, adminId: 2, role: "admin", ... } }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Super Admin
// 2. บันทึกลงตาราง adminRoles
// 3. บันทึก Audit Log
// 4. ส่ง Webhook notification
// 5. ส่งกลับผลลัพธ์
```

##### `adminManagement.updateRole`
```typescript
// เปลี่ยนสิทธิ์แอดมิน
// Input: { adminId: 2, newRole: "super_admin" }
// Output: { success: boolean, adminRole: AdminRole }
// ตัวอย่าง:
// { success: true, adminRole: { id: 2, adminId: 2, role: "super_admin", ... } }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Super Admin
// 2. อัพเดตตาราง adminRoles
// 3. บันทึก Audit Log (บันทึกค่าเก่า-ใหม่)
// 4. ส่ง Webhook notification
// 5. ส่งกลับผลลัพธ์
```

##### `adminManagement.delete`
```typescript
// ลบแอดมิน
// Input: { adminId: 2 }
// Output: { success: boolean }
// ตัวอย่าง:
// { success: true }
//
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสิทธิ์ Super Admin
// 2. ลบจากตาราง adminRoles
// 3. บันทึก Audit Log
// 4. ส่ง Webhook notification
// 5. ส่งกลับผลลัพธ์
```

---

#### 🎯 **auditLogViewer Router** - ดูบันทึกการกระทำ

##### `auditLogViewer.getAccessApprovals`
```typescript
// ดึงบันทึกการอนุญาติการเข้า
// Input: { roomId: "room_101", limit: 50, offset: 0 }
// Output: AccessApproval[]
// ตัวอย่าง:
// [
//   {
//     id: 1,
//     studentId: 6410101,
//     roomId: "room_101",
//     approvedBy: 1,
//     approvalReason: "ลืมสร้าง QR Code",
//     approvalTime: "2026-03-18 14:30:00",
//     expiresAt: "2026-03-18 14:35:00"
//   }
// ]
```

##### `auditLogViewer.getSystemActionLogs`
```typescript
// ดึงบันทึกการกระทำอัตโนมัติของระบบ
// Input: { roomId: "room_101", limit: 50, offset: 0 }
// Output: SystemActionLog[]
// ตัวอย่าง:
// [
//   {
//     id: 1,
//     roomId: "room_101",
//     actionType: "auto_unlock",
//     reason: "Re-entry Window ยังใช้ได้",
//     status: "success",
//     timestamp: "2026-03-18 14:30:00"
//   }
// ]
```

##### `auditLogViewer.getAdminActivityLogs`
```typescript
// ดึงบันทึกการกระทำของแอดมิน
// Input: { adminId: 1, limit: 50, offset: 0 }
// Output: AdminActivityLog[]
// ตัวอย่าง:
// [
//   {
//     id: 1,
//     adminId: 1,
//     actionType: "update_settings",
//     actionDetails: { settingKey: "qr_expiry_minutes", oldValue: "5", newValue: "10" },
//     ipAddress: "192.168.1.1",
//     userAgent: "Mozilla/5.0...",
//     timestamp: "2026-03-18 14:30:00"
//   }
// ]
```

##### `auditLogViewer.getAuditLogs`
```typescript
// ดึงบันทึก Audit Log ทั้งหมด
// Input: { filter: "all" | "admin" | "system", limit: 50, offset: 0 }
// Output: AuditLog[]
// ตัวอย่าง:
// [
//   {
//     id: 1,
//     eventType: "admin_approval",
//     description: "Admin สมชาย อนุญาติให้นักศึกษา 6410101 เข้าห้อง 101",
//     adminId: 1,
//     timestamp: "2026-03-18 14:30:00",
//     ipAddress: "192.168.1.1"
//   }
// ]
```

---

## Frontend Components

### 🎨 Pages

#### 📄 **StudentAccess.tsx** - หน้าสำหรับนักศึกษา

```typescript
// ขั้นตอนการทำงาน:
// 1. แสดง QR Code ปัจจุบัน (อัพเดตทุก 5 วินาที)
// 2. แสดงเวลาหมดอายุ QR Code
// 3. ปุ่ม "ออกจากห้อง" (Offline Mode)
// 4. แสดงประวัติการเข้าออก 10 รายการล่าสุด
// 5. แสดงสถานะ WiFi (Online/Offline)
// 6. ปุ่ม "รีเฟรช" เพื่อสร้าง QR Code ใหม่

// Features:
// - Real-time QR Code generation
// - Offline mode support
// - Access history display
// - WiFi status indicator
// - Responsive design
```

**ตัวอย่างการใช้งาน:**
```
1. นักศึกษา 6410101 เข้าหน้า StudentAccess
2. ระบบสร้าง QR Code ใหม่
3. QR Code แสดงบนจอ (2.4" TFT Touch Screen ที่ ESP32)
4. นักศึกษาสแกน QR Code ด้วยมือถือ
5. Backend ตรวจสอบ QR Code
6. ถ้าถูกต้อง → ส่งคำสั่งไปยัง ESP32 → เปิดประตู
7. ถ้าผิด → แสดงข้อความแจ้งเตือน
```

---

#### 📄 **AdminDashboard.tsx** - หน้า Admin Dashboard

```typescript
// ขั้นตอนการทำงาน:
// 1. แสดงรายชื่อห้องทั้งหมด
// 2. แสดงสถานะประตูแต่ละห้อง (เปิด/ปิด)
// 3. แสดง Audit Log ล่าสุด
// 4. ปุ่มเพื่อ:
//    - สร้าง QR Code ใหม่
//    - อนุญาติการเข้า
//    - ทดสอบเสียง Buzzer
//    - ดูประวัติการเข้าออก
//    - ตั้งค่าเวลาเปิด-ปิด
// 5. ตัวกรอง (Filter) ตามวันที่, ประเภท, Admin ID

// Features:
// - Real-time door status
// - Audit log display with filters
// - Admin action buttons
// - Webhook notification history
// - Settings management
// - Export to CSV
```

**ตัวอย่างการใช้งาน:**
```
1. Admin สมชาย เข้าหน้า AdminDashboard
2. ดูสถานะห้อง 101-103 (ปิดทั้งหมด)
3. ดู Audit Log ล่าสุด
4. กดปุ่ม "สร้าง QR Code ใหม่" สำหรับห้อง 101
5. ระบบสร้าง QR Code ใหม่
6. QR Code ส่งไปยัง ESP32 ที่ห้อง 101
7. ESP32 แสดง QR Code บนจอ
8. นักศึกษาสแกน QR Code
9. Admin ได้รับ Webhook notification
```

---

### 🧩 Components

#### **OfflineModeExitButton.tsx** - ปุ่มออฟไลน์โหมด

```typescript
// ขั้นตอนการทำงาน:
// 1. ตรวจสอบสถานะ WiFi
// 2. ถ้า Online → ส่ง HTTP POST ไปยัง Backend
// 3. ถ้า Offline → บันทึกลงใน IndexedDB
// 4. แสดง Toast notification
// 5. อัพเดต UI

// Features:
// - Online/Offline detection
// - IndexedDB storage
// - Auto-sync when WiFi back
// - Toast notifications
// - Loading state
```

**ตัวอย่างการใช้งาน:**
```
1. นักศึกษา 6410101 อยู่ในห้อง 101
2. WiFi ขาด
3. นักศึกษากดปุ่ม "ออกจากห้อง"
4. ระบบบันทึกลงใน IndexedDB:
   {
     studentId: 6410101,
     roomId: "room_101",
     accessType: "exit",
     method: "offline_button",
     timestamp: "2026-03-18 14:30:00"
   }
5. แสดง "บันทึกการออกห้องสำเร็จ (ออฟไลน์โหมด)"
6. เมื่อ WiFi กลับมา → ซิงค์ข้อมูลไปยัง Backend
7. Backend บันทึกลงฐานข้อมูล
8. ส่ง Webhook notification
```

---

## ESP32 Firmware

### 📝 **offline_exit_button.ino** - โค้ด C สำหรับ ESP32

#### 🔧 Configuration Section (บรรทัด 36-47)

```cpp
// ===== WiFi Configuration =====
const char* WIFI_SSID = "MyWiFi";                    // ชื่อ WiFi
const char* WIFI_PASSWORD = "MyPassword123";         // รหัส WiFi

// ===== Backend API Configuration =====
const char* BACKEND_BASE_URL = "http://192.168.1.100"; // IP Raspberry Pi
const char* BACKEND_PORT = "3000";                   // Port Backend

// ===== Device Configuration =====
int DEFAULT_STUDENT_ID = 6410101;                    // รหัสนักศึกษา
const char* DEFAULT_ROOM_ID = "room_101";            // รหัสห้อง

// ===== GPIO Configuration =====
const int BUTTON_PIN = 4;                            // ปุ่มออฟไลน์โหมด
const int BUZZER_PIN = 5;                            // Buzzer
const int LED_PIN = 2;                               // LED
const int RELAY_PIN = 12;                            // Relay (Magnetic Lock)
```

---

#### 🔌 GPIO Pinout

```cpp
// ===== GPIO Connections =====
// GPIO 4  → Push Button (Offline Mode)
// GPIO 5  → Buzzer (Piezoelectric)
// GPIO 2  → LED (Status Indicator)
// GPIO 12 → Relay Module (Magnetic Lock Control)
// GPIO 13 → Door Sensor (Magnetic Reed Switch)
// GPIO 14 → LCD 2.4" TFT Touch Screen (SPI)
// GPIO 15 → LCD 2.4" TFT Touch Screen (SPI)
// GPIO 23 → LCD 2.4" TFT Touch Screen (SPI)
// GPIO 18 → LCD 2.4" TFT Touch Screen (SPI)
```

---

#### 🔄 Main Functions

##### `setup()` - เริ่มต้นระบบ
```cpp
void setup() {
  Serial.begin(115200);                    // เริ่มต้น Serial Monitor
  
  // ===== GPIO Setup =====
  pinMode(BUTTON_PIN, INPUT_PULLUP);       // ปุ่ม (Pull-up)
  pinMode(BUZZER_PIN, OUTPUT);             // Buzzer
  pinMode(LED_PIN, OUTPUT);                // LED
  pinMode(RELAY_PIN, OUTPUT);              // Relay
  digitalWrite(RELAY_PIN, HIGH);           // Relay off (Active Low)
  
  // ===== SPIFFS Setup =====
  if (!SPIFFS.begin(true)) {
    Serial.println("SPIFFS Mount Failed");
    return;
  }
  
  // ===== WiFi Setup =====
  setupWiFi();                             // เชื่อมต่อ WiFi
  
  // ===== LCD Setup =====
  initializeLCD();                         // เริ่มต้น LCD
  
  // ===== Load Offline Data =====
  loadOfflineData();                       // โหลดข้อมูลออฟไลน์
}
```

---

##### `loop()` - วนซ้ำตรวจสอบ
```cpp
void loop() {
  // ===== Button Detection =====
  handleButtonPress();                     // ตรวจสอบการกดปุ่ม
  
  // ===== Door Sensor Check =====
  checkDoorSensor();                       // ตรวจสอบประตู
  
  // ===== WiFi Status Check =====
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi Disconnected!");
    digitalWrite(LED_PIN, LOW);            // LED off
    isOnline = false;
  } else {
    digitalWrite(LED_PIN, HIGH);           // LED on
    isOnline = true;
  }
  
  // ===== Sync Offline Data =====
  if (isOnline && offlineDataQueue.size() > 0) {
    syncOfflineData();                     // ซิงค์ข้อมูลออฟไลน์
  }
  
  delay(100);                              // Delay 100ms
}
```

---

##### `handleButtonPress()` - ตรวจสอบการกดปุ่ม
```cpp
void handleButtonPress() {
  static unsigned long lastPressTime = 0;
  static bool buttonPressed = false;
  
  int buttonState = digitalRead(BUTTON_PIN);
  
  if (buttonState == LOW && !buttonPressed) {
    // ===== Button Pressed =====
    buttonPressed = true;
    lastPressTime = millis();
    Serial.println("Button Pressed!");
    
    // ===== Play Buzzer =====
    playBuzzer(100);                       // Buzzer 100ms
    
  } else if (buttonState == HIGH && buttonPressed) {
    // ===== Button Released =====
    unsigned long pressDuration = millis() - lastPressTime;
    buttonPressed = false;
    
    if (pressDuration < 1000) {
      // ===== Short Press (< 1 second) =====
      Serial.println("Short Press - Record Offline Exit");
      recordOfflineExit();                 // บันทึกการออกห้อง
      
    } else if (pressDuration >= 1000) {
      // ===== Long Press (>= 1 second) =====
      Serial.println("Long Press - Sync Offline Data");
      syncOfflineData();                   // ซิงค์ข้อมูล
    }
  }
}
```

---

##### `recordOfflineExit()` - บันทึกการออกห้อง
```cpp
void recordOfflineExit() {
  // ===== Create Offline Exit Record =====
  OfflineExitRecord record;
  record.studentId = DEFAULT_STUDENT_ID;
  record.roomId = DEFAULT_ROOM_ID;
  record.timestamp = millis();             // Timestamp (ms)
  record.method = "offline_button";
  
  // ===== Save to SPIFFS =====
  saveToSPIFFS(record);                    // บันทึกลงไฟล์
  
  // ===== Add to Queue =====
  offlineDataQueue.push_back(record);      // เพิ่มลงคิว
  
  // ===== Play Success Buzzer =====
  playBuzzer(200);                         // Buzzer 200ms
  
  // ===== Display Message on LCD =====
  displayMessage("ออกห้องสำเร็จ (ออฟไลน์โหมด)");
  
  Serial.println("Offline Exit Recorded!");
}
```

---

##### `syncOfflineData()` - ซิงค์ข้อมูลออฟไลน์
```cpp
void syncOfflineData() {
  if (offlineDataQueue.size() == 0) {
    Serial.println("No offline data to sync");
    return;
  }
  
  Serial.println("Syncing offline data...");
  
  // ===== Loop through queue =====
  for (auto& record : offlineDataQueue) {
    // ===== Send to Backend =====
    bool success = sendToBackend(record);
    
    if (success) {
      // ===== Remove from queue =====
      offlineDataQueue.erase(
        std::remove(offlineDataQueue.begin(), offlineDataQueue.end(), record),
        offlineDataQueue.end()
      );
      
      // ===== Play Success Buzzer =====
      playBuzzer(100);
      
    } else {
      // ===== Retry later =====
      Serial.println("Sync failed, retry later");
      playBuzzer(500);
      break;
    }
  }
  
  // ===== Save Queue to SPIFFS =====
  saveQueueToSPIFFS();
  
  Serial.println("Sync completed!");
}
```

---

##### `sendToBackend()` - ส่งไปยัง Backend
```cpp
bool sendToBackend(OfflineExitRecord record) {
  // ===== Create HTTP Client =====
  HTTPClient http;
  
  // ===== Build URL =====
  String url = String(BACKEND_BASE_URL) + ":" + BACKEND_PORT + 
               "/api/trpc/mockESP32.recordOfflineExit";
  
  // ===== Build JSON Payload =====
  DynamicJsonDocument doc(200);
  doc["studentId"] = record.studentId;
  doc["roomId"] = record.roomId;
  doc["timestamp"] = record.timestamp;
  doc["method"] = record.method;
  
  String payload;
  serializeJson(doc, payload);
  
  // ===== Send HTTP POST =====
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.POST(payload);
  
  if (httpCode == 200) {
    // ===== Success =====
    Serial.println("Backend response: " + http.getString());
    http.end();
    return true;
    
  } else {
    // ===== Error =====
    Serial.println("HTTP Error: " + String(httpCode));
    http.end();
    return false;
  }
}
```

---

##### `checkDoorSensor()` - ตรวจสอบประตู
```cpp
void checkDoorSensor() {
  static bool lastDoorStatus = true;      // true = closed
  
  int sensorValue = digitalRead(13);       // GPIO 13 (Door Sensor)
  bool doorClosed = (sensorValue == HIGH); // HIGH = closed
  
  if (doorClosed != lastDoorStatus) {
    // ===== Door Status Changed =====
    lastDoorStatus = doorClosed;
    
    if (!doorClosed) {
      // ===== Door Opened =====
      Serial.println("Door Opened!");
      playBuzzer(200);
      displayMessage("ประตูเปิด");
      
      // ===== Send to Backend =====
      sendDoorStatusToBackend("open");
      
    } else {
      // ===== Door Closed =====
      Serial.println("Door Closed!");
      displayMessage("ประตูปิด");
      
      // ===== Send to Backend =====
      sendDoorStatusToBackend("closed");
    }
  }
}
```

---

##### `playBuzzer()` - เล่นเสียง Buzzer
```cpp
void playBuzzer(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);          // Buzzer on
  delay(duration);                         // รอ
  digitalWrite(BUZZER_PIN, LOW);           // Buzzer off
}
```

---

##### `saveToSPIFFS()` - บันทึกลงไฟล์
```cpp
void saveToSPIFFS(OfflineExitRecord record) {
  // ===== Create JSON =====
  DynamicJsonDocument doc(200);
  doc["studentId"] = record.studentId;
  doc["roomId"] = record.roomId;
  doc["timestamp"] = record.timestamp;
  doc["method"] = record.method;
  
  // ===== Generate Filename =====
  String filename = "/offline_" + String(record.timestamp) + ".json";
  
  // ===== Write to File =====
  File file = SPIFFS.open(filename, "w");
  if (file) {
    serializeJson(doc, file);
    file.close();
    Serial.println("Saved to SPIFFS: " + filename);
  } else {
    Serial.println("Failed to save to SPIFFS");
  }
}
```

---

##### `loadOfflineData()` - โหลดข้อมูลออฟไลน์
```cpp
void loadOfflineData() {
  // ===== List all files in SPIFFS =====
  File root = SPIFFS.open("/");
  File file = root.openNextFile();
  
  while (file) {
    String filename = file.name();
    
    if (filename.startsWith("/offline_")) {
      // ===== Read JSON =====
      DynamicJsonDocument doc(200);
      deserializeJson(doc, file);
      
      // ===== Create Record =====
      OfflineExitRecord record;
      record.studentId = doc["studentId"];
      record.roomId = doc["roomId"];
      record.timestamp = doc["timestamp"];
      record.method = doc["method"];
      
      // ===== Add to Queue =====
      offlineDataQueue.push_back(record);
      
      Serial.println("Loaded offline data: " + filename);
    }
    
    file = root.openNextFile();
  }
}
```

---

## Helper Functions

### 📚 **qrCodeHelper.ts** - ฟังก์ชันสร้าง QR Code

```typescript
// ===== Generate QR Code =====
export async function generateQRCode(data: string): Promise<string> {
  // 1. สร้าง QR Code จากข้อมูล
  // 2. แปลงเป็น Data URL (PNG)
  // 3. ส่งกลับรูปภาพ
  
  const qrCode = await QRCode.toDataURL(data, {
    width: 300,
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    }
  });
  
  return qrCode;
}

// ===== Verify QR Code =====
export async function verifyQRCode(token: string): Promise<boolean> {
  // 1. ตรวจสอบ Token ว่าเป็น UUID
  // 2. ตรวจสอบในฐานข้อมูล
  // 3. ตรวจสอบว่าหมดอายุหรือไม่
  // 4. ตรวจสอบว่าใช้แล้วหรือไม่
  
  const qrCode = await db.select().from(qrCodes)
    .where(eq(qrCodes.code, token))
    .limit(1);
  
  if (!qrCode || qrCode.length === 0) {
    return false; // QR Code ไม่พบ
  }
  
  if (qrCode[0].isUsed) {
    return false; // QR Code ใช้แล้ว
  }
  
  if (new Date() > qrCode[0].expiresAt) {
    return false; // QR Code หมดอายุ
  }
  
  return true; // QR Code ถูกต้อง
}
```

---

### 📚 **webhookHelper.ts** - ฟังก์ชันส่ง Webhook

```typescript
// ===== Send Webhook Notification =====
export async function sendWebhookNotification(
  provider: 'line' | 'telegram' | 'slack' | 'email',
  webhookUrl: string,
  message: string,
  title?: string
): Promise<boolean> {
  try {
    let payload: any;
    
    if (provider === 'line') {
      // ===== Line Webhook Format =====
      payload = {
        messages: [
          {
            type: 'text',
            text: `${title}\n${message}`
          }
        ]
      };
      
    } else if (provider === 'telegram') {
      // ===== Telegram Webhook Format =====
      payload = {
        text: `${title}\n${message}`,
        parse_mode: 'HTML'
      };
      
    } else if (provider === 'slack') {
      // ===== Slack Webhook Format =====
      payload = {
        text: title,
        attachments: [
          {
            text: message,
            color: 'good'
          }
        ]
      };
      
    } else if (provider === 'email') {
      // ===== Email Format =====
      payload = {
        subject: title,
        body: message
      };
    }
    
    // ===== Send HTTP POST =====
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    
    return response.ok;
    
  } catch (error) {
    console.error('Webhook Error:', error);
    return false;
  }
}

// ===== Example Usage =====
// await sendWebhookNotification(
//   'line',
//   'https://notify-api.line.me/api/notify',
//   'นักศึกษา 6410101 เข้าห้อง 101 เมื่อ 14:30',
//   'การเข้าห้องสำเร็จ'
// );
```

---

### 📚 **auditLogHelper.ts** - ฟังก์ชันบันทึก Audit Log

```typescript
// ===== Log Admin Activity =====
export async function logAdminActivity(
  adminId: number,
  actionType: string,
  actionDetails: any,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const db = await getDb();
  
  await db.insert(adminActivityLogs).values({
    adminId,
    actionType,
    actionDetails: JSON.stringify(actionDetails),
    ipAddress,
    userAgent,
    timestamp: new Date()
  });
}

// ===== Log Access Approval =====
export async function logAccessApproval(
  studentId: number,
  roomId: string,
  approvedBy: number,
  approvalReason: string,
  expiresAt?: Date
): Promise<void> {
  const db = await getDb();
  
  await db.insert(accessApprovals).values({
    studentId,
    roomId,
    approvedBy,
    approvalReason,
    approvalTime: new Date(),
    expiresAt: expiresAt || new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  });
}

// ===== Log System Action =====
export async function logSystemAction(
  roomId: string,
  actionType: string,
  reason: string,
  status: 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  const db = await getDb();
  
  await db.insert(systemActionLogs).values({
    roomId,
    actionType,
    reason,
    status,
    errorMessage,
    timestamp: new Date()
  });
}

// ===== Example Usage =====
// await logAdminActivity(
//   1,
//   'approve_access',
//   { studentId: 6410101, roomId: 'room_101', reason: 'ลืมสร้าง QR Code' },
//   '192.168.1.1',
//   'Mozilla/5.0...'
// );
```

---

## Audit Log System

### 📊 ระบบบันทึกการกระทำ

#### 4 ประเภทของ Audit Log

| ประเภท | ตาราง | ข้อมูล | ตัวอย่าง |
|--------|--------|--------|---------|
| **Admin Activity** | `adminActivityLogs` | Admin ID, Action Type, Details, IP, User Agent | Admin สมชาย เปลี่ยนตั้งค่า QR expiry จาก 5 เป็น 10 นาที |
| **Access Approval** | `accessApprovals` | Student ID, Room ID, Approved By, Reason | Admin ปัญญา อนุญาติให้นักศึกษา 6410101 เข้าห้อง 101 เพราะ "ลืมสร้าง QR Code" |
| **System Action** | `systemActionLogs` | Room ID, Action Type, Reason, Status | ระบบเปิดประตูห้อง 101 อัตโนมัติเพราะ "Re-entry Window ยังใช้ได้" |
| **Audit Log** | `auditLogs` | Event Type, Description, Admin/System ID, IP | ทุกการกระทำสำคัญของระบบ |

---

#### 📝 ตัวอย่างการบันทึก

```
Timeline: 2026-03-18 14:30:00

14:30:00 - Admin Activity Log
  Admin: สมชาย (ID: 1)
  Action: สร้าง QR Code ใหม่ สำหรับห้อง 101
  IP: 192.168.1.1
  User Agent: Mozilla/5.0...

14:30:05 - Access Approval Log
  Student: 6410101 (สมชาย ใจดี)
  Room: room_101
  Approved By: Admin ปัญญา (ID: 2)
  Reason: ลืมสร้าง QR Code
  Expires At: 14:35:00

14:30:10 - System Action Log
  Room: room_101
  Action: auto_unlock
  Reason: Re-entry Window ยังใช้ได้
  Status: success

14:30:15 - Webhook Event Log
  Event Type: access_granted
  Provider: Line
  Message: นักศึกษา 6410101 เข้าห้อง 101 เมื่อ 14:30
  Status: sent
```

---

## Offline Mode

### 🔌 ระบบทำงานแบบออฟไลน์

#### ขั้นตอนการทำงาน

```
1. WiFi ขาด
   ↓
2. นักศึกษากดปุ่ม "ออกจากห้อง"
   ↓
3. ESP32 บันทึกลงใน SPIFFS:
   {
     studentId: 6410101,
     roomId: "room_101",
     accessType: "exit",
     method: "offline_button",
     timestamp: 1710770400000
   }
   ↓
4. แสดง "บันทึกการออกห้องสำเร็จ (ออฟไลน์โหมด)"
   ↓
5. เก็บไว้ในคิว (offlineDataQueue)
   ↓
6. WiFi กลับมา
   ↓
7. ESP32 ตรวจสอบคิว
   ↓
8. ส่ง HTTP POST ไปยัง Backend:
   POST /api/trpc/mockESP32.recordOfflineExit
   {
     studentId: 6410101,
     roomId: "room_101",
     timestamp: 1710770400000,
     method: "offline_button"
   }
   ↓
9. Backend บันทึกลงฐานข้อมูล
   ↓
10. ส่ง Webhook notification ไปยัง Admin
    "นักศึกษา 6410101 ออกห้อง 101 (ออฟไลน์โหมด) เมื่อ 14:30"
    ↓
11. ลบข้อมูลออกจากคิว
    ↓
12. เสร็จสิ้น
```

---

#### 📊 Offline Data Storage (SPIFFS)

```
ESP32 SPIFFS Structure:
/
├── offline_1710770400000.json
│   {
│     "studentId": 6410101,
│     "roomId": "room_101",
│     "timestamp": 1710770400000,
│     "method": "offline_button"
│   }
├── offline_1710770460000.json
│   {
│     "studentId": 6410102,
│     "roomId": "room_102",
│     "timestamp": 1710770460000,
│     "method": "offline_button"
│   }
└── queue.json
    [
      { "studentId": 6410101, "roomId": "room_101", ... },
      { "studentId": 6410102, "roomId": "room_102", ... }
    ]
```

---

#### 🔄 Sync Logic

```typescript
// ===== Sync Algorithm =====
async function syncOfflineData() {
  // 1. ตรวจสอบ WiFi
  if (WiFi.status() !== WL_CONNECTED) {
    return; // ยังไม่ออนไลน์
  }
  
  // 2. โหลดคิวจากไฟล์
  const queue = loadQueueFromSPIFFS();
  
  // 3. วนซ้ำแต่ละรายการ
  for (const record of queue) {
    // 4. ส่งไปยัง Backend
    const success = await sendToBackend(record);
    
    if (success) {
      // 5. ลบออกจากคิว
      removeFromQueue(record);
      
      // 6. ลบไฟล์ SPIFFS
      SPIFFS.remove(`/offline_${record.timestamp}.json`);
      
    } else {
      // 7. Retry ครั้งต่อไป
      break;
    }
  }
  
  // 8. บันทึกคิวที่อัพเดต
  saveQueueToSPIFFS(queue);
}
```

---

## 🎯 สรุป

ระบบนี้ประกอบด้วย:

1. **Database** - 12 ตาราง MySQL เก็บข้อมูลทั้งหมด
2. **Backend API** - tRPC procedures สำหรับทุกการกระทำ
3. **Frontend** - React Pages สำหรับนักศึกษาและแอดมิน
4. **ESP32 Firmware** - โค้ด C สำหรับควบคุมประตู
5. **Audit Log** - บันทึกทุกการกระทำ
6. **Offline Mode** - ทำงานได้แม้ไม่มี WiFi
7. **Webhook** - แจ้งเตือนไปยัง Line, Telegram, Email

ทุกส่วนทำงานร่วมกันเพื่อให้ระบบสมบูรณ์และปลอดภัย! 🎉


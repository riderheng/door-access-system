# Hardware Requirements — ระบบบริหารจัดการสิทธิ์เข้าห้องเรียน

**โปรเจค:** นวัตกรรมระบบบริหารจัดการสิทธิ์และควบคุมเข้าใช้ห้องเรียนผ่านเครือข่ายไร้สาย
**มหาวิทยาลัย:** ราชมงคลพระนคร คณะครุศาสตร์ (RMUTP)

---

## รายการอุปกรณ์

| # | อุปกรณ์ | จำนวน | บทบาท |
|---|---------|--------|-------|
| 1 | Raspberry Pi 4 Model B 4GB Starter Kit | 1 ชุด | **Edge Server** — รัน Node.js + tRPC + MySQL ในเครื่อง ให้ระบบทำงานต่อได้แม้ internet ขาด และ sync ขึ้น cloud เมื่อกลับมา |
| 2 | ESP32 Development Board | 1 บอร์ด | ไมโครคอนโทรลเลอร์ควบคุมประตูและ Sensor |
| 3 | Relay Module 1-channel | 1 ตัว | สวิตช์ตัด/ต่อไฟให้ Solenoid Lock |
| 4 | Solenoid Door Lock 12VDC | 1 ตัว | กลอนไฟฟ้าล็อก/ปลดล็อกประตู |
| 5 | Reed Switch Door Sensor MC-38 | 1 ชุด | เซ็นเซอร์แม่เหล็กตรวจสถานะประตูเปิด/ปิด |
| 6 | Active Buzzer 5V | 1 ตัว | เสียงเตือนเมื่อสแกนผิด / ประตูค้าง |
| 7 | LED 5mm (แพ็ค 30 หลอด) | 1 แพ็ค | ไฟแสดงสถานะ (เขียว/แดง/น้ำเงิน) |
| 8 | Push Button กันน้ำ | 1 ปุ่ม | ปุ่มออกห้องโหมดออฟไลน์ |
| 9 | Adapter 12V 2A | 1 ตัว | แหล่งจ่ายไฟหลักของระบบ |
| 10 | Step-Down Module 12V to 5V | 1 ตัว | แปลงไฟ 12V → 5V สำหรับ ESP32 / Pi |
| 11 | กล่องพลาสติก ABS | 1 ใบ | กล่องห่อหุ้มวงจร ติดตั้งข้างประตู |
| 12 | สายไฟ Jumper | 1 ชุด | สายเชื่อมต่อวงจร |
| 13 | Perfboard / PCB 5x7cm | 5 แผ่น | แผ่นวงจรสำหรับบัดกรีอุปกรณ์ |
| 14 | ตัวต้านทาน Pull-up 10kΩ | 600 ชิ้น | Pull-up สำหรับ GPIO Input |
| 15 | จอ 3.2 นิ้ว | 1 จอ | แสดงสถานะ / UI หน้าประตู |

---

## แผนผังการต่อวงจร (GPIO)

```
ESP32 Pin Layout:
┌─────────────────────────────────────────────┐
│  GPIO 34  ←── Reed Switch MC-38 (Pull-up)   │
│  GPIO 35  ←── Push Button กันน้ำ (Pull-up)  │
│  GPIO 25  ──► Active Buzzer 5V              │
│  GPIO 26  ──► LED สีเขียว                   │
│  GPIO 27  ──► LED สีแดง                     │
│  GPIO 32  ──► Relay Module → Solenoid Lock  │
│  GPIO 21  ──► จอ 3.2" (SPI / I2C)           │
│  5V, GND  ←── Step-Down Module 12V→5V       │
└─────────────────────────────────────────────┘

Power Flow:
Adapter 12V 2A
    │
    ├── Solenoid Door Lock 12V (ผ่าน Relay)
    │
    └── Step-Down 12V→5V
            │
            ├── ESP32
            ├── Raspberry Pi 4
            └── จอ 3.2"
```

---

## Architecture Overview

```
                ┌─────────────────────┐
                │     Cloud Server    │  (optional — สำหรับ dashboard กลาง)
                │  (Production tRPC)  │
                └──────────┬──────────┘
                           │  sync เมื่อมี internet
                           │
        ┌──────────────────┴──────────────────┐
        │      Raspberry Pi 4 (Edge Server)   │
        │   ┌─────────────────────────────┐   │
        │   │  Node.js + Express + tRPC   │   │
        │   │  MySQL (local DB)           │   │
        │   │  React UI → จอ 3.2"         │   │
        │   └─────────────────────────────┘   │
        └──────────────────┬──────────────────┘
                           │  WiFi / LAN
                           │
                ┌──────────┴──────────┐
                │       ESP32         │
                │  (Door Controller)  │
                └──────────┬──────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   Reed Switch       Relay + Solenoid    Push Button
   (MC-38)           (12V Lock)          (Offline Exit)
        │                  │                  │
        └─── Buzzer + LED แสดงสถานะ ────────┘
```

## Flow การสื่อสาร

```
[ESP32] ──► [Raspberry Pi 4 Edge Server] ──► [Cloud (เมื่อมี internet)]

Online Mode:
    ESP32 ──► Pi 4 (LAN)
        │
        ├── Reed Switch เปลี่ยน → POST /trpc/access.updateDoorStatus
        │     { roomId: "room_101", status: "open" }
        │
        └── สแกน QR สำเร็จ → POST /trpc/access.verifyAndRecordAccess
              { qrCode, roomId, accessType: "entry"/"exit" }
              └── Pi ตอบ OK → ESP32 เปิด Relay 3 วินาที → Solenoid ปลดล็อก

Offline Mode (Internet ขาด แต่ Pi ยัง online):
    ระบบยังทำงานปกติ เพราะ Pi เป็น Edge Server
    Pi เก็บ log ไว้ใน MySQL local → sync ขึ้น cloud เมื่อ internet กลับมา

Offline Mode (ทั้ง Pi และ Cloud ขาดทั้งคู่):
    ESP32 ──► กด Push Button กันน้ำ
        ├── Relay ON → ปลดล็อกประตู
        └── เก็บ log ใน ESP32 local memory (isOfflineSync=true)
        └── เมื่อ Pi กลับมา → POST /trpc/access.recordOfflineExit  ⚠️ ยังไม่มี endpoint นี้ใน backend
```

> ⚠️ **Known Issue:** `OfflineModeExitButton.tsx:202` และ `offline_exit_button.ino` ยังเรียก `mockESP32.recordOfflineExit` ซึ่งไม่มี router นี้ใน `server/routers.ts` — ต้องสร้าง endpoint ใหม่ (แนะนำเพิ่มใน `access` router) ก่อน sync ใช้งานได้จริง

---

## หมายเหตุสำหรับการทดสอบ

โปรเจคมี **Mock ESP32 Router** (`server/routers/mockESP32.ts`) สำหรับทดสอบระบบผ่านหน้าเว็บ
โดยไม่ต้องมี hardware จริง รองรับ:
- `generateQRCode` — สร้าง QR ทดสอบ
- `verifyQRCode` — ตรวจสอบ QR
- `recordAccess` / `recordExit` — บันทึกการเข้าออก
- `updateDoorStatus` — จำลองสถานะประตู
- `recordOfflineExit` — จำลองการออกแบบออฟไลน์
- `healthCheck` — ตรวจสอบการเชื่อมต่อ

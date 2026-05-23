# Installation Scripts

## install-pi.sh — Raspberry Pi 4 Setup

ติดตั้งระบบทั้งหมดบน Raspberry Pi 4 ในคำสั่งเดียว

### Prerequisites

- Raspberry Pi 4 (4GB) + Raspberry Pi OS 64-bit (Bookworm หรือใหม่กว่า)
- เชื่อมต่อ internet
- มีสิทธิ์ sudo

### วิธีใช้

```bash
# 1. Copy โค้ดทั้งหมดไปที่ Pi (เช่นผ่าน git clone หรือ scp)
sudo mkdir -p /opt/door-access
sudo chown $USER /opt/door-access
git clone <repo-url> /opt/door-access

# 2. รัน install script
cd /opt/door-access
sudo bash scripts/install-pi.sh
```

### Environment Variables (Override defaults)

```bash
APP_DIR=/opt/door-access \
APP_USER=pi \
DB_NAME=door_access_system \
DB_USER=door_access \
DB_PASS=your_secure_password \
  sudo -E bash scripts/install-pi.sh
```

### สิ่งที่ Script ทำให้

1. ✅ อัพเดต system packages
2. ✅ ติดตั้ง Node.js 20 (NodeSource)
3. ✅ ติดตั้ง pnpm 10
4. ✅ ติดตั้ง MariaDB (compatible กับ MySQL)
5. ✅ สร้าง database + user
6. ✅ สร้าง `.env.local` จาก template (auto-generate JWT_SECRET)
7. ✅ รัน database migrations (`pnpm db:push`)
8. ✅ Build production bundle
9. ✅ ติดตั้ง systemd service (`door-access.service`) — auto-restart on boot/crash
10. ✅ เปิด firewall port 3000

### หลังติดตั้งเสร็จ

```bash
# ดู status
sudo systemctl status door-access

# ดู logs
journalctl -u door-access -f

# Restart หลังแก้ .env.local
sudo systemctl restart door-access
```

### ต้องแก้ใน .env.local เอง

- `VITE_APP_ID` — App ID จาก Manus OAuth
- `OAUTH_SERVER_URL` — Manus OAuth server URL
- `OWNER_OPEN_ID` — OpenID ของ super admin (ดูจาก login ครั้งแรก)
- `SMTP_*` — สำหรับ email notification (optional)
- `LINE_WEBHOOK_URL` / `TELEGRAM_BOT_TOKEN` — webhook (optional)

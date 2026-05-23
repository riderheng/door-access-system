#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#  Door Access System — Raspberry Pi 4 Installation Script
#  Project: นวัตกรรมระบบบริหารจัดการสิทธิ์และควบคุมเข้าใช้ห้องเรียน — RMUTP
#
#  รันบน Raspberry Pi OS (64-bit, Bookworm หรือใหม่กว่า):
#    curl -fsSL <repo>/scripts/install-pi.sh | bash
#  หรือ:
#    bash install-pi.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

NODE_VERSION="20"
APP_DIR="${APP_DIR:-/opt/door-access}"
APP_USER="${APP_USER:-$(whoami)}"
DB_NAME="${DB_NAME:-door_access_system}"
DB_USER="${DB_USER:-door_access}"
DB_PASS="${DB_PASS:-changeme$(date +%s)}"
SERVICE_NAME="door-access"

log()  { printf "\n\033[1;34m▶ %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m⚠ %s\033[0m\n" "$*"; }
err()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "ต้องรันด้วย sudo: sudo bash $0"
  fi
}

step_system_update() {
  log "อัพเดต package list"
  apt-get update -y
  apt-get upgrade -y
  apt-get install -y curl git build-essential ca-certificates gnupg
}

step_install_node() {
  if command -v node >/dev/null 2>&1 && [[ $(node -v) == v${NODE_VERSION}.* ]]; then
    log "Node.js v${NODE_VERSION} ติดตั้งแล้ว — ข้าม"
    return
  fi
  log "ติดตั้ง Node.js v${NODE_VERSION} (NodeSource)"
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
  node -v
}

step_install_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    log "pnpm ติดตั้งแล้ว — ข้าม"
    return
  fi
  log "ติดตั้ง pnpm"
  npm install -g pnpm@10
  pnpm -v
}

step_install_mysql() {
  if command -v mariadb >/dev/null 2>&1 || command -v mysql >/dev/null 2>&1; then
    log "MySQL/MariaDB ติดตั้งแล้ว — ข้าม"
    return
  fi
  log "ติดตั้ง MariaDB (เบากว่า MySQL บน Pi)"
  apt-get install -y mariadb-server
  systemctl enable --now mariadb
}

step_create_database() {
  log "สร้างฐานข้อมูล ${DB_NAME} และ user ${DB_USER}"
  mariadb <<SQL
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL
  log "Database URL: mysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}"
}

step_setup_app() {
  if [[ ! -d "$APP_DIR" ]]; then
    err "ไม่พบโฟลเดอร์ $APP_DIR — copy โค้ดไปที่นั่นก่อน หรือ set APP_DIR=<path> ก่อนรัน script นี้"
  fi
  log "ติดตั้ง dependencies ที่ $APP_DIR"
  cd "$APP_DIR"
  sudo -u "$APP_USER" pnpm install --frozen-lockfile

  if [[ ! -f "$APP_DIR/.env.local" ]]; then
    log "สร้าง .env.local จาก template"
    cp "$APP_DIR/.env.local.example" "$APP_DIR/.env.local"
    sed -i "s#^DATABASE_URL=.*#DATABASE_URL=mysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}#" "$APP_DIR/.env.local"
    JWT=$(openssl rand -hex 32)
    sed -i "s#^JWT_SECRET=.*#JWT_SECRET=${JWT}#" "$APP_DIR/.env.local"
    warn "กรุณาแก้ค่า OAuth (VITE_APP_ID, OAUTH_SERVER_URL) ใน $APP_DIR/.env.local"
  fi

  log "Run database migrations"
  sudo -u "$APP_USER" pnpm db:push

  log "Build app"
  sudo -u "$APP_USER" pnpm build
}

step_install_systemd() {
  log "ติดตั้ง systemd service: ${SERVICE_NAME}"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Door Access System (RMUTP)
After=network.target mariadb.service
Wants=mariadb.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env.local
ExecStart=$(command -v node) ${APP_DIR}/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable "${SERVICE_NAME}"
  systemctl restart "${SERVICE_NAME}"
  systemctl status "${SERVICE_NAME}" --no-pager || true
}

step_firewall() {
  if ! command -v ufw >/dev/null 2>&1; then
    return
  fi
  log "เปิด port 3000 ใน firewall (ufw)"
  ufw allow 3000/tcp || true
}

main() {
  require_root
  step_system_update
  step_install_node
  step_install_pnpm
  step_install_mysql
  step_create_database
  step_setup_app
  step_install_systemd
  step_firewall

  log "ติดตั้งสำเร็จ ✅"
  echo "  - App URL:      http://$(hostname -I | awk '{print $1}'):3000"
  echo "  - Service:      systemctl status ${SERVICE_NAME}"
  echo "  - Logs:         journalctl -u ${SERVICE_NAME} -f"
  echo "  - Restart:      sudo systemctl restart ${SERVICE_NAME}"
  echo "  - Env file:     ${APP_DIR}/.env.local"
  echo
  warn "อย่าลืมแก้ค่า OAuth + SMTP ใน .env.local แล้วรัน: sudo systemctl restart ${SERVICE_NAME}"
}

main "$@"

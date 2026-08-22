#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fakenet-billing}"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
NODE_MIN_MAJOR="${NODE_MIN_MAJOR:-18}"
NODE_SETUP_MAJOR="${NODE_SETUP_MAJOR:-20}"
GENIEACS_VERSION="${GENIEACS_VERSION:-1.2.16}"
GENIEACS_ENV_FILE="${GENIEACS_ENV_FILE:-/etc/fakenet-billing-genieacs.env}"
GENIEACS_MONGODB_IMAGE_DEFAULT="${GENIEACS_MONGODB_IMAGE_DEFAULT:-docker.io/library/mongo:7}"

GENIEACS_UNITS=(
  fakenet-billing-genieacs-mongodb.service
  fakenet-billing-genieacs-cwmp.service
  fakenet-billing-genieacs-nbi.service
  fakenet-billing-genieacs-fs.service
  fakenet-billing-genieacs-ui.service
)

APP_UNITS=(
  fakenet-billing.service
  fakenet-billing-isolir.service
  fakenet-billing-voucher.service
  fakenet-billing-wifiku.service
  fakenet-billing-radius-connector.service
  fakenet-billing-waha.service
)

SYSTEMD_BASE_GROUPS=(
  "redis-server.service redis.service"
  "postgresql.service postgresql@15-main.service postgresql@14-main.service postgresql@13-main.service"
  "freeradius.service radiusd.service"
  "docker.service"
)

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Jalankan sebagai root: sudo bash install.sh" >&2
    exit 1
  fi
}

detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then echo apt; return; fi
  echo unknown
}

require_debian_ubuntu_systemd() {
  local os_id os_like
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "Installer ini hanya mendukung Debian/Ubuntu berbasis apt." >&2
    exit 1
  fi
  if ! command -v systemctl >/dev/null 2>&1; then
    echo "Installer ini membutuhkan systemd. CT/LXC tanpa systemd tidak direkomendasikan." >&2
    exit 1
  fi
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    os_id="${ID:-}"
    os_like="${ID_LIKE:-}"
    case " $os_id $os_like " in
      *" debian "*|*" ubuntu "*) return 0 ;;
    esac
  fi
  echo "OS tidak dikenali sebagai Debian/Ubuntu. Support installer difokuskan ke Debian/Ubuntu saja." >&2
  exit 1
}

node_major() {
  if ! command -v node >/dev/null 2>&1; then
    echo 0
    return
  fi
  node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0
}

random_hex() {
  local bytes="${1:-24}"
  openssl rand -hex "$bytes" 2>/dev/null || date +%s%N
}

install_packages() {
  local pm
  pm="$(detect_pm)"
  case "$pm" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y \
        ca-certificates curl git rsync tar gzip gnupg openssl procps iproute2 \
        postgresql postgresql-client redis-server \
        freeradius freeradius-postgresql freeradius-utils \
        snmp docker.io tesseract-ocr \
        build-essential python3 make g++ netcat-openbsd
      ;;
    *)
      echo "Installer ini hanya mendukung Debian/Ubuntu berbasis apt." >&2
      exit 1
      ;;
  esac
}

install_ocr_runtime() {
  command -v tesseract >/dev/null 2>&1 && return 0
  local pm
  pm="$(detect_pm)"
  echo "Instal dependency OCR KTP (Tesseract)..."
  case "$pm" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y tesseract-ocr
      ;;
    *)
      echo "Tesseract OCR belum tersedia. Jalankan di Debian/Ubuntu lalu ulangi install.sh." >&2
      return 1
      ;;
  esac
}

ensure_required_commands() {
  local missing=() cmd
  for cmd in curl git rsync tar gzip openssl psql pg_dump node npm docker pgrep snmpwalk snmpget radclient tesseract; do
    command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
  done
  if ! command -v freeradius >/dev/null 2>&1 && ! command -v radiusd >/dev/null 2>&1; then
    missing+=("freeradius/radiusd")
  fi
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Komponen berikut belum tersedia: ${missing[*]}" >&2
    echo "Periksa repository OS/EPEL/CRB atau install paket terkait, lalu ulangi install.sh." >&2
    exit 1
  fi
}

genieacs_commands_available() {
  local command
  for command in genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui; do
    command -v "$command" >/dev/null 2>&1 || return 1
  done
  return 0
}

port_is_listening() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    if ss -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"; then
      return 0
    fi
    return 1
  fi
  if command -v netstat >/dev/null 2>&1; then
    if netstat -lnt 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]${port}$"; then
      return 0
    fi
    return 1
  fi
  return 1
}

external_genieacs_unit_exists() {
  command -v systemctl >/dev/null 2>&1 || return 1
  if systemctl list-unit-files 'genieacs*.service' --no-legend 2>/dev/null | grep -qv '^fakenet-billing-genieacs-'; then
    return 0
  fi
  return 1
}

fakenet_genieacs_unit_exists() {
  command -v systemctl >/dev/null 2>&1 || return 1
  if systemctl list-unit-files 'fakenet-billing-genieacs-*.service' --no-legend 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

external_genieacs_process_exists() {
  pgrep -af 'genieacs-(cwmp|nbi|fs|ui)' >/dev/null 2>&1 || return 1
  if pgrep -af 'fakenet-billing-genieacs' >/dev/null 2>&1; then
    return 1
  fi
  return 0
}

external_genieacs_detected() {
  [ "${INSTALL_GENIEACS:-1}" = "0" ] && return 1
  external_genieacs_unit_exists && return 0
  external_genieacs_process_exists && return 0
  for port in 7547 7557 7567 7568; do
    port_is_listening "$port" && return 0
  done
  return 1
}

cleanup_fakenet_genieacs_services() {
  if command -v systemctl >/dev/null 2>&1; then
    systemctl stop "${GENIEACS_UNITS[@]}" >/dev/null 2>&1 || true
    systemctl disable "${GENIEACS_UNITS[@]}" >/dev/null 2>&1 || true
    rm -f /etc/systemd/system/fakenet-billing-genieacs-*.service
    systemctl daemon-reload >/dev/null 2>&1 || true
    systemctl reset-failed >/dev/null 2>&1 || true
  fi
  if command -v docker >/dev/null 2>&1; then
    docker rm -f fakenet-billing-genieacs-mongodb >/dev/null 2>&1 || true
  fi
}

auto_skip_existing_genieacs() {
  if external_genieacs_detected; then
    INSTALL_GENIEACS=0
    GENIEACS_EXTERNAL_DETECTED=1
    export INSTALL_GENIEACS GENIEACS_EXTERNAL_DETECTED
    cleanup_fakenet_genieacs_services
    echo "GenieACS existing terdeteksi. Instalasi GenieACS bawaan FAKE.NET Billing dilewati agar tidak konflik service/port."
    echo "Billing akan memakai GenieACS existing dan mencoba mengunci NBI ke 127.0.0.1:7557."
  fi
}

install_node_runtime() {
  if [ "$(node_major)" -ge "$NODE_MIN_MAJOR" ] && command -v npm >/dev/null 2>&1; then
    return
  fi

  local pm setup
  pm="$(detect_pm)"
  setup="/tmp/fakenet-node-setup.sh"
  case "$pm" in
    apt)
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" -o "$setup"
      bash "$setup"
      DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
      ;;
    *)
      echo "Node.js otomatis hanya didukung pada Debian/Ubuntu." >&2
      exit 1
      ;;
  esac
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js belum terpasang" >&2
    exit 1
  fi
  local major
  major="$(node_major)"
  if [ "$major" -lt "$NODE_MIN_MAJOR" ]; then
    echo "Node.js minimal v$NODE_MIN_MAJOR. Versi saat ini: $(node -v)" >&2
    echo "Update Node.js dahulu, lalu ulangi install.sh." >&2
    exit 1
  fi
}

verify_repository_payload() {
  local missing=() file
  local required_files=(
    package.json
    package-lock.json
    src/server.js
    src/subweb-server.js
    src/radius-connector-service.js
    src/whatsapp-queue.js
    public/index.html
    public/app.js
    public/styles.css
    public/service-worker.js
    public/manifest.webmanifest
    deploy/fakenet-billing.env
    deploy/fakenet-billing-waha.env
    deploy/fakenet-billing-genieacs.env
    deploy/genieacs/bootstrap.js
    deploy/genieacs/virtual-parameters/IPTR069.js
    deploy/genieacs/virtual-parameters/LANActiveClients.js
    deploy/genieacs/virtual-parameters/LANClients.js
    deploy/genieacs/virtual-parameters/PonMac.js
    deploy/genieacs/virtual-parameters/RXPower.js
    deploy/genieacs/virtual-parameters/WlanPassword.js
    deploy/genieacs/virtual-parameters/activedevices.js
    deploy/genieacs/virtual-parameters/getSerialNumber.js
    deploy/genieacs/virtual-parameters/getdeviceuptime.js
    deploy/genieacs/virtual-parameters/getponmode.js
    deploy/genieacs/virtual-parameters/getpppuptime.js
    deploy/genieacs/virtual-parameters/gettemp.js
    deploy/genieacs/virtual-parameters/ip.js
    deploy/genieacs/virtual-parameters/pppoe.js
    deploy/genieacs/virtual-parameters/pppoeIP.js
    deploy/genieacs/virtual-parameters/pppoeMac.js
    deploy/genieacs/virtual-parameters/pppoePassword.js
    deploy/genieacs/virtual-parameters/pppoeUsername.js
    deploy/genieacs/virtual-parameters/pppoeUsername2.js
    deploy/genieacs/virtual-parameters/superAdmin.js
    deploy/genieacs/virtual-parameters/superPassword.js
    deploy/genieacs/virtual-parameters/userAdmin.js
    deploy/genieacs/virtual-parameters/userPassword.js
    deploy/genieacs/virtual-parameters/wanVlan.js
    deploy/genieacs/virtual-parameters/wifiSsid24.js
    deploy/genieacs/virtual-parameters/wifiSsid5.js
    deploy/sql/freeradius-postgresql.sql
    deploy/bin/fakenet-billing-stack
    deploy/bin/fakenet-billing-update
    deploy/systemd/fakenet-billing.service
    deploy/systemd/fakenet-billing-isolir.service
    deploy/systemd/fakenet-billing-voucher.service
    deploy/systemd/fakenet-billing-wifiku.service
    deploy/systemd/fakenet-billing-radius-connector.service
    deploy/systemd/fakenet-billing-waha.service
    deploy/systemd/fakenet-billing-stack.target
    deploy/systemd/fakenet-billing-genieacs-mongodb.service
    deploy/systemd/fakenet-billing-genieacs-cwmp.service
    deploy/systemd/fakenet-billing-genieacs-nbi.service
    deploy/systemd/fakenet-billing-genieacs-fs.service
    deploy/systemd/fakenet-billing-genieacs-ui.service
  )
  for file in "${required_files[@]}"; do
    [ -f "$SOURCE_DIR/$file" ] || missing+=("$file")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Repository tidak lengkap. File berikut tidak ditemukan: ${missing[*]}" >&2
    echo "Unduh/clone ulang repository lengkap, lalu jalankan install.sh kembali." >&2
    exit 1
  fi
}

copy_source() {
  mkdir -p "$APP_DIR"
  rsync -a --delete \
    --exclude node_modules \
    --exclude data \
    --exclude .env \
    "$SOURCE_DIR/" "$APP_DIR/"
  mkdir -p "$APP_DIR/data"
  touch "$APP_DIR/data/.gitkeep"
}

install_node_deps() {
  local npm_timeout_seconds install_status
  local -a timeout_command
  npm_timeout_seconds="${FAKENET_NPM_INSTALL_TIMEOUT_SECONDS:-600}"
  cd "$APP_DIR"
  echo "Instal dependency Node.js (timeout ${npm_timeout_seconds}s)"
  set +e
  if command -v timeout >/dev/null 2>&1 && timeout --help 2>&1 | grep -q -- '--foreground'; then
    timeout_command=(timeout --foreground --signal=TERM --kill-after=30s "$npm_timeout_seconds")
  elif command -v timeout >/dev/null 2>&1; then
    timeout_command=(timeout -s TERM -k 30 "$npm_timeout_seconds")
  else
    timeout_command=()
  fi
  if [ -f package-lock.json ]; then
    "${timeout_command[@]}" npm ci --omit=dev --no-audit --no-fund --prefer-offline --fetch-retries=2 --fetch-timeout=60000
  else
    "${timeout_command[@]}" npm install --omit=dev --no-audit --no-fund --prefer-offline --fetch-retries=2 --fetch-timeout=60000
  fi
  install_status=$?
  set -e
  if [ "$install_status" -eq 124 ] || [ "$install_status" -eq 137 ]; then
    echo "Instal dependency melewati timeout ${npm_timeout_seconds}s." >&2
    return 1
  fi
  [ "$install_status" -eq 0 ] || return "$install_status"
  node -e "require('bullmq'); require('web-push'); require('sharp'); require('./src/whatsapp-queue')" >/dev/null
}

install_genieacs_runtime() {
  if [ "${INSTALL_GENIEACS:-1}" = "0" ]; then
    echo "Instal GenieACS dinonaktifkan melalui INSTALL_GENIEACS=0."
    return 0
  fi
  if genieacs_commands_available; then
    echo "Binary GenieACS sudah tersedia. Instal paket genieacs global dilewati."
    return 0
  fi
  local pm
  pm="$(detect_pm)"
  if [ "$pm" = "apt" ] && command -v apt-cache >/dev/null 2>&1 && apt-cache show genieacs >/dev/null 2>&1; then
    echo "Paket GenieACS tersedia di apt repository; mencoba instal via apt terlebih dahulu."
    local apt_status
    set +e
    DEBIAN_FRONTEND=noninteractive apt-get install -y genieacs
    apt_status=$?
    set -e
    if [ "$apt_status" -eq 0 ] && genieacs_commands_available; then
      echo "GenieACS berhasil dipasang dari apt repository."
      return 0
    fi
    echo "Paket apt GenieACS tidak tersedia/lengkap di OS ini; lanjut fallback instal via npm." >&2
  fi
  local npm_timeout_seconds install_status
  local -a timeout_command
  npm_timeout_seconds="${FAKENET_NPM_INSTALL_TIMEOUT_SECONDS:-600}"
  echo "Instal GenieACS v${GENIEACS_VERSION} (timeout ${npm_timeout_seconds}s)"
  if command -v timeout >/dev/null 2>&1 && timeout --help 2>&1 | grep -q -- '--foreground'; then
    timeout_command=(timeout --foreground --signal=TERM --kill-after=30s "$npm_timeout_seconds")
  elif command -v timeout >/dev/null 2>&1; then
    timeout_command=(timeout -s TERM -k 30 "$npm_timeout_seconds")
  else
    timeout_command=()
  fi
  set +e
  "${timeout_command[@]}" npm install -g --no-audit --no-fund --prefer-offline \
    --fetch-retries=2 --fetch-timeout=60000 "genieacs@${GENIEACS_VERSION}"
  install_status=$?
  set -e
  if [ "$install_status" -eq 124 ] || [ "$install_status" -eq 137 ]; then
    echo "Instal GenieACS melewati timeout ${npm_timeout_seconds}s." >&2
    return 1
  fi
  [ "$install_status" -eq 0 ] || return "$install_status"
  local command
  for command in genieacs-cwmp genieacs-nbi genieacs-fs genieacs-ui; do
    command -v "$command" >/dev/null 2>&1 || {
      echo "Binary $command tidak ditemukan setelah instal GenieACS." >&2
      return 1
    }
  done
}

ensure_genieacs_mongodb_image() {
  [ "${INSTALL_GENIEACS:-1}" = "0" ] && return 0
  [ -f "$GENIEACS_ENV_FILE" ] || return 0
  ensure_genieacs_mongodb_image_env
  load_genieacs_env
  local image
  image="$(normalize_genieacs_mongodb_image "${GENIEACS_MONGODB_IMAGE:-}")"
  replace_or_append_env "$GENIEACS_ENV_FILE" GENIEACS_MONGODB_IMAGE "$image"
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
}

verify_billing_health() {
  local attempt payload
  for attempt in $(seq 1 30); do
    payload="$(curl -fsS --max-time 3 http://127.0.0.1:8891/api/health 2>/dev/null || true)"
    if printf '%s' "$payload" | grep -q '"ok":true'; then
      if printf '%s' "$payload" | grep -q '"backend":"bullmq"' \
        && printf '%s' "$payload" | grep -q '"available":true'; then
        echo "Health check Billing dan BullMQ berhasil."
      else
        echo "Health check Billing berhasil."
      fi
      return 0
    fi
    sleep 1
  done
  echo "Health check Billing/BullMQ gagal setelah 30 detik." >&2
  return 1
}

replace_or_append_env() {
  local file="$1" key="$2" value="$3"
  local escaped
  escaped="$(printf '%s' "$value" | sed 's/[\/&]/\\&/g')"
  if grep -q "^${key}=" "$file"; then
    sed -i "s/^${key}=.*/${key}=${escaped}/" "$file"
  else
    printf '%s=%s\n' "$key" "$value" >> "$file"
  fi
}

append_env_if_missing() {
  local file="$1" key="$2" value="$3"
  grep -q "^${key}=" "$file" || printf '%s=%s\n' "$key" "$value" >> "$file"
}

read_env_value_raw() {
  local file="$1" key="$2" line value
  [ -f "$file" ] || return 1
  line="$(grep -m1 "^${key}=" "$file" 2>/dev/null || true)"
  [ -n "$line" ] || return 1
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s\n' "$value"
}

normalize_genieacs_mongodb_image() {
  local raw
  raw="$(printf '%s' "${1:-}" | tr -s '[:space:]' ' ' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  case "$raw" in
    ""|"mongo"|"mongo:7"|"docker.io mongo:7"|"docker.io/mongo:7"|"library/mongo"|"library/mongo:7")
      printf '%s\n' "$GENIEACS_MONGODB_IMAGE_DEFAULT"
      ;;
    *)
      printf '%s\n' "$raw"
      ;;
  esac
}

ensure_genieacs_mongodb_image_env() {
  [ -f "$GENIEACS_ENV_FILE" ] || return 0
  local current normalized
  current="$(read_env_value_raw "$GENIEACS_ENV_FILE" GENIEACS_MONGODB_IMAGE || true)"
  normalized="$(normalize_genieacs_mongodb_image "$current")"
  replace_or_append_env "$GENIEACS_ENV_FILE" GENIEACS_MONGODB_IMAGE "$normalized"
}

ensure_wa_gateway_env_defaults() {
  local file="/etc/fakenet-billing.env" send_interval timeout
  [ -f "$file" ] || return 0
  send_interval="$(read_env_value_raw "$file" WA_GATEWAY_SEND_INTERVAL_MS || true)"
  if ! [[ "$send_interval" =~ ^[0-9]+$ ]] || [ "$send_interval" -lt 30000 ]; then
    replace_or_append_env "$file" WA_GATEWAY_SEND_INTERVAL_MS 30000
  fi
  timeout="$(read_env_value_raw "$file" WA_GATEWAY_HTTP_TIMEOUT_MS || true)"
  if ! [[ "$timeout" =~ ^[0-9]+$ ]] || [ "$timeout" -lt 15000 ]; then
    replace_or_append_env "$file" WA_GATEWAY_HTTP_TIMEOUT_MS 15000
  fi
}

ensure_update_env_defaults() {
  local file="/etc/fakenet-billing.env" timeout retries
  [ -f "$file" ] || return 0
  timeout="$(read_env_value_raw "$file" FAKENET_UPDATE_DOWNLOAD_TIMEOUT_SECONDS || true)"
  if ! [[ "$timeout" =~ ^[0-9]+$ ]] || [ "$timeout" -lt 900 ]; then
    replace_or_append_env "$file" FAKENET_UPDATE_DOWNLOAD_TIMEOUT_SECONDS 900
  fi
  retries="$(read_env_value_raw "$file" FAKENET_UPDATE_DOWNLOAD_RETRIES || true)"
  if ! [[ "$retries" =~ ^[0-9]+$ ]] || [ "$retries" -lt 4 ]; then
    replace_or_append_env "$file" FAKENET_UPDATE_DOWNLOAD_RETRIES 4
  fi
  append_env_if_missing "$file" FAKENET_UPDATE_BRANCH main
  append_env_if_missing "$file" FAKENET_UPDATE_ARCHIVE_URL https://github.com/fakehotspot12/FAKE.NET-BILLING/archive/refs/heads/main.tar.gz
  append_env_if_missing "$file" FAKENET_UPDATE_RAW_BASE_URL https://raw.githubusercontent.com/fakehotspot12/FAKE.NET-BILLING/main
}

harden_runtime_permissions() {
  local file directory
  for file in /etc/fakenet-billing.env /etc/fakenet-billing-waha.env "$GENIEACS_ENV_FILE"; do
    [ ! -f "$file" ] || chmod 600 "$file"
  done
  if [ -d "$APP_DIR/data" ]; then
    find "$APP_DIR/data" -type d -exec chmod 700 {} + 2>/dev/null || true
    find "$APP_DIR/data" -type f -exec chmod 600 {} + 2>/dev/null || true
  fi
  for directory in /var/backups/fakenet-billing /var/log/fakenet-billing; do
    [ ! -d "$directory" ] || chmod 700 "$directory"
  done
  if [ -d /var/backups/fakenet-billing ]; then
    find /var/backups/fakenet-billing -maxdepth 1 -type f -exec chmod 600 {} + 2>/dev/null || true
  fi
  [ ! -f /var/log/fakenet-billing/update.log ] || chmod 600 /var/log/fakenet-billing/update.log
}

prepare_genieacs_env_file() {
  local source_mode="${1:-bundled}" genieacs_jwt_secret
  if [ ! -f "$GENIEACS_ENV_FILE" ]; then
    cp "$APP_DIR/deploy/fakenet-billing-genieacs.env" "$GENIEACS_ENV_FILE"
  fi
  genieacs_jwt_secret="$(random_hex 64)"
  if grep -q 'CHANGE_ME_GENIEACS_JWT_SECRET' "$GENIEACS_ENV_FILE"; then
    sed -i "s/CHANGE_ME_GENIEACS_JWT_SECRET/$genieacs_jwt_secret/g" "$GENIEACS_ENV_FILE"
  fi
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_UI_USERNAME billing
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_UI_PASSWORD billing123
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_CWMP_AUTH_USERNAME admin
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_CWMP_AUTH_PASSWORD 1sampai10
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_MONGODB_CONNECTION_URL mongodb://127.0.0.1:27017/genieacs
  replace_or_append_env "$GENIEACS_ENV_FILE" GENIEACS_NBI_INTERFACE 127.0.0.1
  append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_NBI_PORT 7557
  if [ "$source_mode" = "bundled" ]; then
    ensure_genieacs_mongodb_image_env
  else
    append_env_if_missing "$GENIEACS_ENV_FILE" GENIEACS_MONGODB_IMAGE "$GENIEACS_MONGODB_IMAGE_DEFAULT"
  fi
  chmod 600 "$GENIEACS_ENV_FILE"
}

systemd_genieacs_nbi_env_file() {
  command -v systemctl >/dev/null 2>&1 || return 1
  local line entry path
  while IFS= read -r line; do
    for entry in $line; do
      path="${entry#-}"
      path="${path%\"}"
      path="${path#\"}"
      path="${path%\'}"
      path="${path#\'}"
      [ -f "$path" ] && printf '%s\n' "$path" && return 0
    done
  done < <(systemctl cat genieacs-nbi.service 2>/dev/null | sed -n 's/^[[:space:]]*EnvironmentFile=//p')
  for path in /opt/genieacs/genieacs.env /etc/genieacs/genieacs.env /etc/default/genieacs /etc/sysconfig/genieacs; do
    [ -f "$path" ] && printf '%s\n' "$path" && return 0
  done
  return 1
}

lock_existing_genieacs_nbi_localhost() {
  [ "${FAKENET_LOCK_EXISTING_GENIEACS_NBI:-1}" = "0" ] && return 0
  [ "${GENIEACS_EXTERNAL_DETECTED:-0}" = "1" ] || return 0
  command -v systemctl >/dev/null 2>&1 || return 0
  systemctl cat genieacs-nbi.service >/dev/null 2>&1 || return 0

  local env_file backup owner group attempt nbi_status
  env_file="$(systemd_genieacs_nbi_env_file || true)"
  if [ -n "$env_file" ]; then
    backup="${env_file}.bak-fakenet-lock7557"
    [ -f "$backup" ] || cp -a "$env_file" "$backup" 2>/dev/null || true
    owner="$(stat -c %U "$env_file" 2>/dev/null || echo "")"
    group="$(stat -c %G "$env_file" 2>/dev/null || echo "")"
    replace_or_append_env "$env_file" GENIEACS_NBI_INTERFACE 127.0.0.1
    replace_or_append_env "$env_file" GENIEACS_NBI_PORT 7557
    [ -n "$owner" ] && [ -n "$group" ] && chown "$owner:$group" "$env_file" 2>/dev/null || true
    chmod 600 "$env_file" 2>/dev/null || true
  else
    mkdir -p /etc/systemd/system/genieacs-nbi.service.d
    cat > /etc/systemd/system/genieacs-nbi.service.d/fakenet-billing-localhost.conf <<'EOF'
[Service]
Environment=GENIEACS_NBI_INTERFACE=127.0.0.1
Environment=GENIEACS_NBI_PORT=7557
EOF
    systemctl daemon-reload >/dev/null 2>&1 || true
  fi

  if ! systemctl restart genieacs-nbi.service >/dev/null 2>&1; then
    echo "Peringatan: gagal restart GenieACS NBI existing setelah lock localhost. Periksa genieacs-nbi.service." >&2
    return 0
  fi
  for attempt in $(seq 1 "${GENIEACS_NBI_LOCK_ATTEMPTS:-45}"); do
    nbi_status="$(curl -sS --max-time 2 http://127.0.0.1:7557/devices/?limit=1 2>/dev/null || true)"
    if [[ "$nbi_status" == \[* ]]; then
      echo "GenieACS existing NBI dikunci ke 127.0.0.1:7557."
      return 0
    fi
    sleep 1
  done
  echo "Peringatan: GenieACS NBI existing belum siap setelah lock localhost; billing tetap lanjut dan bootstrap akan dicoba ulang saat repair/update berikutnya." >&2
}

install_env() {
  local app_db_password radius_db_password app_admin_password waha_api_key waha_password waha_webhook_secret
  if [ ! -f /etc/fakenet-billing.env ]; then
    cp "$APP_DIR/deploy/fakenet-billing.env" /etc/fakenet-billing.env
  fi

  app_db_password="$(random_hex 24)"
  radius_db_password="$(random_hex 24)"
  if grep -q 'CHANGE_ME_APP_DB_PASSWORD' /etc/fakenet-billing.env; then
    sed -i "s/CHANGE_ME_APP_DB_PASSWORD/$app_db_password/g" /etc/fakenet-billing.env
    replace_or_append_env /etc/fakenet-billing.env APP_DATABASE_PASSWORD "$app_db_password"
  fi
  if grep -q 'CHANGE_ME_RADIUS_DB_PASSWORD' /etc/fakenet-billing.env; then
    sed -i "s/CHANGE_ME_RADIUS_DB_PASSWORD/$radius_db_password/g" /etc/fakenet-billing.env
    replace_or_append_env /etc/fakenet-billing.env RADIUS_DATABASE_PASSWORD "$radius_db_password"
  fi
  app_admin_password="$(random_hex 12)"
  append_env_if_missing /etc/fakenet-billing.env APP_ADMIN_USERNAME admin
  append_env_if_missing /etc/fakenet-billing.env APP_ADMIN_NAME "Admin Billing"
  append_env_if_missing /etc/fakenet-billing.env APP_ADMIN_PASSWORD "$app_admin_password"
  ensure_wa_gateway_env_defaults
  ensure_update_env_defaults

  if [ -n "${FAKENET_LICENSE_PUBLIC_KEY:-}" ] && ! grep -q '^LICENSE_PUBLIC_KEY=' /etc/fakenet-billing.env; then
    local escaped_public_key
    escaped_public_key="$(printf '%s' "$FAKENET_LICENSE_PUBLIC_KEY" | sed ':a;N;$!ba;s/\n/\\n/g')"
    printf '\nLICENSE_PUBLIC_KEY="%s"\n' "$escaped_public_key" >> /etc/fakenet-billing.env
  fi

  if [ ! -f /etc/fakenet-billing-waha.env ]; then
    cp "$APP_DIR/deploy/fakenet-billing-waha.env" /etc/fakenet-billing-waha.env
  fi
  waha_api_key="$(random_hex 32)"
  waha_password="$(random_hex 24)"
  waha_webhook_secret="$(random_hex 32)"
  if grep -q 'CHANGE_ME_LONG_RANDOM_API_KEY' /etc/fakenet-billing-waha.env; then
    sed -i "s/CHANGE_ME_LONG_RANDOM_API_KEY/$waha_api_key/g" /etc/fakenet-billing-waha.env
  fi
  if grep -q 'CHANGE_ME_LONG_RANDOM_PASSWORD' /etc/fakenet-billing-waha.env; then
    sed -i "s/CHANGE_ME_LONG_RANDOM_PASSWORD/$waha_password/g" /etc/fakenet-billing-waha.env
  fi
  if grep -q 'CHANGE_ME_LONG_RANDOM_WEBHOOK_HMAC' /etc/fakenet-billing-waha.env; then
    sed -i "s/CHANGE_ME_LONG_RANDOM_WEBHOOK_HMAC/$waha_webhook_secret/g" /etc/fakenet-billing-waha.env
  fi
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_URL http://host.docker.internal:8891/api/webhooks/waha
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_EVENTS message.ack
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_HMAC_KEY "$waha_webhook_secret"
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_RETRIES_POLICY exponential
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_RETRIES_DELAY_SECONDS 2
  append_env_if_missing /etc/fakenet-billing-waha.env WHATSAPP_HOOK_RETRIES_ATTEMPTS 5
  append_env_if_missing /etc/fakenet-billing-waha.env WAHA_PRINT_QR false

  if [ "${INSTALL_GENIEACS:-1}" != "0" ]; then
    prepare_genieacs_env_file bundled
    append_env_if_missing /etc/fakenet-billing.env GENIEACS_ENABLED 1
    append_env_if_missing /etc/fakenet-billing.env GENIEACS_BASE_URL http://127.0.0.1:7557
    replace_or_append_env /etc/fakenet-billing.env FAKENET_BUNDLED_GENIEACS 1
    replace_or_append_env /etc/fakenet-billing.env GENIEACS_SOURCE bundled
  elif [ "${GENIEACS_EXTERNAL_DETECTED:-0}" = "1" ]; then
    prepare_genieacs_env_file existing
    lock_existing_genieacs_nbi_localhost
    append_env_if_missing /etc/fakenet-billing.env GENIEACS_ENABLED 1
    if port_is_listening 7557; then
      append_env_if_missing /etc/fakenet-billing.env GENIEACS_BASE_URL http://127.0.0.1:7557
    fi
    replace_or_append_env /etc/fakenet-billing.env FAKENET_BUNDLED_GENIEACS 0
    replace_or_append_env /etc/fakenet-billing.env GENIEACS_SOURCE existing
  else
    replace_or_append_env /etc/fakenet-billing.env FAKENET_BUNDLED_GENIEACS 0
    replace_or_append_env /etc/fakenet-billing.env GENIEACS_SOURCE disabled
  fi
  harden_runtime_permissions
}

managed_app_units() {
  local unit
  for unit in "${APP_UNITS[@]}"; do
    printf '%s\n' "$unit"
  done
  if [ "${INSTALL_GENIEACS:-1}" != "0" ] && [ -f "$GENIEACS_ENV_FILE" ]; then
    for unit in "${GENIEACS_UNITS[@]}"; do
      printf '%s\n' "$unit"
    done
  fi
}

load_billing_env() {
  set -a
  # shellcheck disable=SC1091
  . /etc/fakenet-billing.env
  set +a
}

load_genieacs_env() {
  [ -f "$GENIEACS_ENV_FILE" ] || return 1
  ensure_genieacs_mongodb_image_env
  set -a
  # shellcheck disable=SC1090
  . "$GENIEACS_ENV_FILE"
  set +a
}

resolve_genieacs_env_file() {
  local candidate
  for candidate in "$GENIEACS_ENV_FILE" /etc/fakenet-billing-genieacs.env /opt/genieacs/genieacs.env /etc/genieacs.env; do
    [ -n "$candidate" ] && [ -f "$candidate" ] && {
      printf '%s\n' "$candidate"
      return 0
    }
  done
  return 1
}

sync_genieacs_virtual_parameters() {
  local attempt bootstrap env_file nbi_port
  bootstrap="$APP_DIR/deploy/genieacs/bootstrap.js"
  [ -f "$bootstrap" ] || return 0
  command -v node >/dev/null 2>&1 || return 0

  env_file="$(resolve_genieacs_env_file || true)"
  [ -n "$env_file" ] || {
    echo "Sinkron Virtual Parameters GenieACS dilewati: env GenieACS tidak ditemukan."
    return 0
  }

  set -a
  # shellcheck disable=SC1090
  . "$env_file"
  set +a

  nbi_port="${GENIEACS_NBI_PORT:-7557}"
  if ! port_is_listening "$nbi_port" && ! port_is_listening 27017; then
    echo "Sinkron Virtual Parameters GenieACS dilewati: NBI/Mongo lokal belum aktif."
    return 0
  fi

  for attempt in 1 2 3; do
    echo "Sinkron Virtual Parameters GenieACS via $env_file (percobaan $attempt/3)"
    if GENIEACS_BOOTSTRAP_EXTERNAL=1 \
      GENIEACS_UI_BOOTSTRAP_ATTEMPTS="${GENIEACS_UI_BOOTSTRAP_ATTEMPTS:-1}" \
      GENIEACS_NBI_BOOTSTRAP_ATTEMPTS="${GENIEACS_NBI_BOOTSTRAP_ATTEMPTS:-6}" \
      GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS="${GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS:-3000}" \
      node "$bootstrap"; then
      echo "Sinkron Virtual Parameters GenieACS berhasil."
      return 0
    fi
    [ "$attempt" -ge 3 ] || sleep 2
  done

  echo "ERROR: sinkron Virtual Parameters GenieACS gagal setelah 3 percobaan; repair dihentikan agar parameter tidak tertinggal." >&2
  return 1
}

systemd_unit_exists() {
  systemctl list-unit-files "$1" --no-legend >/dev/null 2>&1
}

cleanup_obsolete_worker_runtime() {
  local backup_dir changed file
  changed=0

  if command -v systemctl >/dev/null 2>&1; then
    backup_dir="/var/backups/fakenet-billing/systemd-obsolete-$(date +%Y%m%d%H%M%S)"

    if systemd_unit_exists fakenet-billing-worker.service; then
      mkdir -p "$backup_dir"
      systemctl stop fakenet-billing-worker.service >/dev/null 2>&1 || true
      systemctl disable fakenet-billing-worker.service >/dev/null 2>&1 || true
      [ ! -f /etc/systemd/system/fakenet-billing-worker.service ] || cp -a /etc/systemd/system/fakenet-billing-worker.service "$backup_dir/" || true
      [ ! -d /etc/systemd/system/fakenet-billing-worker.service.d ] || cp -a /etc/systemd/system/fakenet-billing-worker.service.d "$backup_dir/" || true
      rm -f /etc/systemd/system/fakenet-billing-worker.service
      rm -rf /etc/systemd/system/fakenet-billing-worker.service.d
      changed=1
    fi

    for file in /etc/systemd/system/fakenet-billing.service.d/*.conf; do
      [ -f "$file" ] || continue
      if grep -q 'FAKENET_ENGINE_ROLE' "$file"; then
        mkdir -p "$backup_dir"
        cp -a "$file" "$backup_dir/" || true
        rm -f "$file"
        changed=1
      fi
    done

    if [ "$changed" -eq 1 ]; then
      echo "Runtime worker Whatsapp lama dinonaktifkan; queue berjalan di service utama."
      systemctl daemon-reload >/dev/null 2>&1 || true
      systemctl reset-failed fakenet-billing-worker.service >/dev/null 2>&1 || true
    fi
  fi

}

resolve_systemd_group() {
  local unit
  for unit in "$@"; do
    if systemd_unit_exists "$unit"; then
      printf '%s\n' "$unit"
      return 0
    fi
  done
  return 1
}

systemd_base_units() {
  local group unit
  for group in "${SYSTEMD_BASE_GROUPS[@]}"; do
    unit="$(resolve_systemd_group $group || true)"
    [ -n "$unit" ] && printf '%s\n' "$unit"
  done
}

start_systemd_base_units() {
  local unit
  mapfile -t units < <(systemd_base_units)
  for unit in "${units[@]}"; do
    systemctl enable "$unit" >/dev/null 2>&1 || true
    systemctl start "$unit" >/dev/null 2>&1 || true
  done
}

rewrite_systemd_unit_dependencies() {
  local file="$1" redis_unit postgres_unit radius_unit docker_unit
  redis_unit="$(resolve_systemd_group redis-server.service redis.service || true)"
  postgres_unit="$(resolve_systemd_group postgresql.service postgresql@15-main.service postgresql@14-main.service postgresql@13-main.service || true)"
  radius_unit="$(resolve_systemd_group freeradius.service radiusd.service || true)"
  docker_unit="$(resolve_systemd_group docker.service || true)"

  [ -n "$redis_unit" ] && sed -i "s/redis-server.service/$redis_unit/g" "$file"
  [ -n "$postgres_unit" ] && sed -i "s/postgresql.service/$postgres_unit/g" "$file"
  [ -n "$radius_unit" ] && sed -i "s/freeradius.service/$radius_unit/g" "$file"
  [ -n "$docker_unit" ] && sed -i "s/docker.service/$docker_unit/g" "$file"
}

install_systemd_unit_file() {
  local unit="$1" name
  [ -f "$unit" ] || return 0
  name="$(basename "$unit")"
  if [[ "$name" == fakenet-billing-genieacs-* ]] && { [ "${INSTALL_GENIEACS:-1}" = "0" ] || [ ! -f "$GENIEACS_ENV_FILE" ]; }; then
    return 0
  fi
  sed \
    -e "s#WorkingDirectory=/opt/fakenet-billing#WorkingDirectory=$APP_DIR#g" \
    -e "s#/opt/fakenet-billing-waha#/opt/fakenet-billing-waha#g" \
    "$unit" > "/etc/systemd/system/$name"
  rewrite_systemd_unit_dependencies "/etc/systemd/system/$name"
}

prepare_genieacs_runtime() {
  [ "${INSTALL_GENIEACS:-1}" = "0" ] && return 0
  [ -f "$GENIEACS_ENV_FILE" ] || return 0
  if ! id genieacs >/dev/null 2>&1; then
    useradd --system --no-create-home --user-group genieacs
  fi
  mkdir -p /opt/fakenet-billing-genieacs/ext /opt/fakenet-billing-genieacs/mongodb /var/log/fakenet-billing
  chown -R genieacs:genieacs /opt/fakenet-billing-genieacs/ext /var/log/fakenet-billing
  chmod 600 "$GENIEACS_ENV_FILE"
}

genieacs_bootstrap_allowed() {
  [ -f "$GENIEACS_ENV_FILE" ] || return 1
  [ "${INSTALL_GENIEACS:-1}" != "0" ] && return 0
  [ "${GENIEACS_EXTERNAL_DETECTED:-0}" = "1" ] && return 0
  [ "${GENIEACS_BOOTSTRAP_EXTERNAL:-1}" = "1" ] && port_is_listening "${GENIEACS_NBI_PORT:-7557}" && return 0
  return 1
}

bootstrap_genieacs() {
  genieacs_bootstrap_allowed || return 0
  load_genieacs_env
  local attempt bootstrap_status
  for attempt in $(seq 1 "${GENIEACS_BOOTSTRAP_ATTEMPTS:-3}"); do
    set +e
    GENIEACS_NBI_BOOTSTRAP_ATTEMPTS="${GENIEACS_NBI_BOOTSTRAP_ATTEMPTS:-24}" \
      GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS="${GENIEACS_BOOTSTRAP_REQUEST_TIMEOUT_MS:-3000}" \
      node "$APP_DIR/deploy/genieacs/bootstrap.js"
    bootstrap_status=$?
    set -e
    [ "$bootstrap_status" -eq 0 ] && return 0
    echo "Peringatan: bootstrap GenieACS belum berhasil (percobaan ${attempt})." >&2
    sleep 5
  done
  echo "Peringatan: bootstrap GenieACS dilewati sementara. Billing tetap berjalan; ulangi repair/update setelah GenieACS UI/NBI siap jika Virtual Parameters belum masuk." >&2
  return 0
}

verify_genieacs_health() {
  [ "${INSTALL_GENIEACS:-1}" = "0" ] && return 0
  [ -f "$GENIEACS_ENV_FILE" ] || return 0
  load_genieacs_env
  local ui_port nbi_port attempt ui_status nbi_status
  ui_port="${GENIEACS_UI_PORT:-7568}"
  nbi_port="${GENIEACS_NBI_PORT:-7557}"
  for attempt in $(seq 1 "${GENIEACS_HEALTH_ATTEMPTS:-120}"); do
    ui_status="$(curl -sS --max-time 2 "http://127.0.0.1:${ui_port}/status" 2>/dev/null || true)"
    nbi_status="$(curl -sS --max-time 2 "http://127.0.0.1:${nbi_port}/devices/?limit=1" 2>/dev/null || true)"
    if [ "$ui_status" = "OK" ] && [[ "$nbi_status" == \[* ]]; then
      echo "Health check GenieACS UI/NBI berhasil; NBI hanya listen di localhost."
      return 0
    fi
    sleep 1
  done
  echo "Health check GenieACS gagal setelah ${GENIEACS_HEALTH_ATTEMPTS:-120} detik." >&2
  return 1
}

restart_systemd_unit_group() {
  local group unit
  group="$1"
  unit="$(resolve_systemd_group $group || true)"
  [ -n "$unit" ] && systemctl restart "$unit" >/dev/null 2>&1 || true
}

validate_freeradius_config() {
  local cmd=""
  if command -v freeradius >/dev/null 2>&1; then
    cmd="freeradius"
  elif command -v radiusd >/dev/null 2>&1; then
    cmd="radiusd"
  fi
  [ -n "$cmd" ] || return 0
  "$cmd" -XC >/tmp/fakenet-billing-freeradius-check.log 2>&1 || {
    echo "Peringatan: validasi FreeRADIUS gagal, lihat /tmp/fakenet-billing-freeradius-check.log" >&2
  }
}

init_postgres_cluster() {
  return 0
}

psql_superuser() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u postgres -- psql "$@"
  else
    su postgres -c "psql $*"
  fi
}

hydrate_radius_database_settings() {
  [ -n "${RADIUS_DATABASE_PASSWORD:-}" ] && return 0
  local radius_url parsed host port database username password
  radius_url="${FREERADIUS_DATABASE_URL:-${FREERADIUS_DB_URL:-}}"
  [ -n "$radius_url" ] || return 0
  parsed="$(RADIUS_URL_TO_PARSE="$radius_url" node -e '
    const url = new URL(process.env.RADIUS_URL_TO_PARSE);
    process.stdout.write([
      url.hostname || "127.0.0.1",
      url.port || "5432",
      decodeURIComponent((url.pathname || "/radius").replace(/^\//, "")) || "radius",
      decodeURIComponent(url.username || "radius"),
      decodeURIComponent(url.password || "")
    ].join("\t"));
  ' 2>/dev/null || true)"
  [ -n "$parsed" ] || return 0
  IFS=$'\t' read -r host port database username password <<< "$parsed"
  export RADIUS_DATABASE_HOST="${host:-127.0.0.1}"
  export RADIUS_DATABASE_PORT="${port:-5432}"
  export RADIUS_DATABASE_NAME="${database:-radius}"
  export RADIUS_DATABASE_USER="${username:-radius}"
  export RADIUS_DATABASE_PASSWORD="${password:-}"
}

postgres_exec_file() {
  local file="$1" database="${2:-postgres}"
  psql_superuser -X -q -v ON_ERROR_STOP=1 -d "$database" -f "$file"
}

init_postgres_databases() {
  if ! command -v psql >/dev/null 2>&1; then
    echo "psql tidak tersedia, lewati inisialisasi database." >&2
    return
  fi

  load_billing_env
  hydrate_radius_database_settings
  local app_db app_user app_pass radius_db radius_user radius_pass sql_file
  app_db="${APP_DATABASE_NAME:-fakenet_billing}"
  app_user="${APP_DATABASE_USER:-fakenet_billing}"
  app_pass="${APP_DATABASE_PASSWORD:-}"
  radius_db="${RADIUS_DATABASE_NAME:-radius}"
  radius_user="${RADIUS_DATABASE_USER:-radius}"
  radius_pass="${RADIUS_DATABASE_PASSWORD:-}"

  if [ -z "$app_pass" ] || [ -z "$radius_pass" ]; then
    echo "Password database belum tersedia di /etc/fakenet-billing.env." >&2
    return
  fi

  sql_file="/tmp/fakenet-billing-init-db-$$.sql"
  cat > "$sql_file" <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$app_user') THEN
    CREATE ROLE $app_user LOGIN PASSWORD '$app_pass';
  ELSE
    ALTER ROLE $app_user LOGIN PASSWORD '$app_pass';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$radius_user') THEN
    CREATE ROLE $radius_user LOGIN PASSWORD '$radius_pass';
  ELSE
    ALTER ROLE $radius_user LOGIN PASSWORD '$radius_pass';
  END IF;
END
\$\$;
SELECT 'CREATE DATABASE $app_db OWNER $app_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$app_db')\gexec
SELECT 'CREATE DATABASE $radius_db OWNER $radius_user' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$radius_db')\gexec
GRANT ALL PRIVILEGES ON DATABASE $app_db TO $app_user;
GRANT ALL PRIVILEGES ON DATABASE $radius_db TO $radius_user;
SQL
  postgres_exec_file "$sql_file" postgres
  rm -f "$sql_file"

  if [ -f "$APP_DIR/deploy/sql/freeradius-postgresql.sql" ]; then
    postgres_exec_file "$APP_DIR/deploy/sql/freeradius-postgresql.sql" "$radius_db"
    sql_file="/tmp/fakenet-billing-radius-grant-$$.sql"
    cat > "$sql_file" <<SQL
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $radius_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $radius_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO $radius_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO $radius_user;
SQL
    postgres_exec_file "$sql_file" "$radius_db"
    rm -f "$sql_file"
  fi
}

backup_freeradius_config_file() {
  local file="$1" root_dir backup_dir
  [ -f "$file" ] || return 0
  case "$file" in
    */mods-enabled/*|*/sites-enabled/*)
      root_dir="${file%/*-enabled/*}"
      backup_dir="$root_dir/fakenet-backups"
      mkdir -p "$backup_dir"
      cp "$file" "$backup_dir/$(basename "$file").fakenet-billing.bak" 2>/dev/null || true
      ;;
    *)
      cp "$file" "${file}.fakenet-billing.bak" 2>/dev/null || true
      ;;
  esac
}

configure_freeradius_sql_file() {
  local sql_file="$1" radius_db_conn="$2"
  [ -f "$sql_file" ] || return 0
  [ -L "$sql_file" ] && return 0

  backup_freeradius_config_file "$sql_file"
  sed -i -E 's/^[[:space:]]*dialect = .*/        dialect = "postgresql"/' "$sql_file" || true
  sed -i -E 's/^[[:space:]]*driver = .*/        driver = "rlm_sql_postgresql"/' "$sql_file" || true
  sed -i -E "s/^[[:space:]]*server = .*/        server = \"${RADIUS_DATABASE_HOST:-127.0.0.1}\"/" "$sql_file" || true
  sed -i -E "s/^[[:space:]]*port = .*/        port = ${RADIUS_DATABASE_PORT:-5432}/" "$sql_file" || true
  sed -i -E "s/^[[:space:]]*login = .*/        login = \"${RADIUS_DATABASE_USER:-radius}\"/" "$sql_file" || true
  sed -i -E "s/^[[:space:]]*password = .*/        password = \"${RADIUS_DATABASE_PASSWORD:-}\"/" "$sql_file" || true
  sed -i -E "s#^[[:space:]]*radius_db = .*#        radius_db = \"$radius_db_conn\"#" "$sql_file" || true
  if printf '%s\n' "$sql_file" | grep -Eq '/mods-config/sql/main/.*/queries\.conf$|/queries\.conf$'; then
    local tmp_sql_file
    tmp_sql_file="$(mktemp)"
    awk '
      /^[[:space:]]*sql_user_name[[:space:]]*=/ {
        if (!done) {
          print "        sql_user_name = \"%{User-Name}\""
          done = 1
        }
        next
      }
      { print }
      END {
        if (!done) print "        sql_user_name = \"%{User-Name}\""
      }
    ' "$sql_file" > "$tmp_sql_file" && cat "$tmp_sql_file" > "$sql_file"
    rm -f "$tmp_sql_file"
  else
    sed -i -E '/^[[:space:]]*sql_user_name[[:space:]]*=/d' "$sql_file" || true
  fi
  sed -i -E 's/^[[:space:]]*#?[[:space:]]*read_clients = .*/        read_clients = yes/' "$sql_file" || true
  sed -i -E 's/^[[:space:]]*client_table = .*/        client_table = "nas"/' "$sql_file" || true
}

configure_freeradius_site_file() {
  local site_file="$1"
  [ -f "$site_file" ] || return 0

  backup_freeradius_config_file "$site_file"
  # ISP usernames commonly use local suffixes such as user@site.
  # FreeRADIUS' default filter_username rejects realms without a dot before SQL auth.
  sed -i -E '/^[[:space:]]*filter_username[[:space:]]*$/s//        # filter_username disabled by fakenet-billing: allow local PPP-Hotspot suffix usernames/' "$site_file" || true
  # SQL is the billing source of truth. Avoid duplicating every accounting packet
  # into unbounded daily detail files under /var/log/freeradius/radacct.
  sed -i -E '/^[[:space:]]*detail([[:space:]]*(#.*)?)$/s//        # detail disabled by fakenet-billing: accounting is persisted in SQL/' "$site_file" || true
  sed -i -E 's/^[[:space:]]*#?[[:space:]]*-?sql([[:space:]]*(#.*)?)$/        sql\1/' "$site_file" || true
  sed -i -E 's/^[[:space:]]*sqlippool([[:space:]]*(#.*)?)$/#        sqlippool\1/' "$site_file" || true
  sed -i -E 's/^[[:space:]]*sql_session_start([[:space:]]*(#.*)?)$/#        sql_session_start\1/' "$site_file" || true
}

configure_freeradius_sql() {
  load_billing_env
  hydrate_radius_database_settings
  if [ -z "${RADIUS_DATABASE_PASSWORD:-}" ]; then
    echo "Lewati konfigurasi FreeRADIUS SQL: password database Radius tidak tersedia." >&2
    return 0
  fi
  local candidate mods_base mods_enabled sites_default sites_inner radius_db_conn configured
  radius_db_conn="host=${RADIUS_DATABASE_HOST:-127.0.0.1} port=${RADIUS_DATABASE_PORT:-5432} dbname=${RADIUS_DATABASE_NAME:-radius} user=${RADIUS_DATABASE_USER:-radius} password=${RADIUS_DATABASE_PASSWORD:-} sslmode=disable"
  configured=0

  for candidate in \
    /etc/freeradius/3.0/mods-available/sql \
    /etc/freeradius/3.0/mods-enabled/sql \
    /etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf; do
    if [ -f "$candidate" ]; then
      configure_freeradius_sql_file "$candidate" "$radius_db_conn"
      configured=1
    fi
  done
  [ "$configured" -eq 1 ] || return 0

  for mods_base in /etc/freeradius/3.0; do
    mods_enabled="$mods_base/mods-enabled"
    if [ -d "$mods_enabled" ]; then
      ln -sf ../mods-available/sql "$mods_enabled/sql" || true
      [ -L "$mods_enabled/sqlippool" ] && rm -f "$mods_enabled/sqlippool" || true
    fi
  done

  for candidate in /etc/freeradius/3.0/mods-enabled/sql; do
    [ -f "$candidate" ] && configure_freeradius_sql_file "$candidate" "$radius_db_conn"
  done

  for sites_default in /etc/freeradius/3.0/sites-enabled/default; do
    configure_freeradius_site_file "$sites_default"
  done
  for sites_inner in /etc/freeradius/3.0/sites-enabled/inner-tunnel; do
    configure_freeradius_site_file "$sites_inner"
  done
}

install_systemd() {
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  local unit
  local -a app_units
  for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.target; do
    install_systemd_unit_file "$unit"
  done
  cleanup_obsolete_worker_runtime
  systemctl daemon-reload
  init_postgres_cluster
  start_systemd_base_units
  if [ "${INSTALL_GENIEACS:-1}" != "0" ] && [ -f "$GENIEACS_ENV_FILE" ]; then
    prepare_genieacs_runtime
    ensure_genieacs_mongodb_image
  fi
  init_postgres_databases
  configure_freeradius_sql
  restart_systemd_unit_group "freeradius.service radiusd.service"
  mapfile -t app_units < <(managed_app_units)
  systemctl enable fakenet-billing-stack.target "${app_units[@]}" >/dev/null 2>&1 || true
  systemctl restart "${app_units[@]}"
  verify_genieacs_health
  bootstrap_genieacs
}

repair_install() {
  mkdir -p /var/log/fakenet-billing
  if [ "${INSTALL_GENIEACS:-1}" = "0" ] && { external_genieacs_unit_exists || external_genieacs_process_exists || port_is_listening "${GENIEACS_NBI_PORT:-7557}"; }; then
    GENIEACS_EXTERNAL_DETECTED=1
    export GENIEACS_EXTERNAL_DETECTED
    cleanup_fakenet_genieacs_services
  fi
  install_ocr_runtime
  install_env

  if [ -f "$APP_DIR/deploy/bin/fakenet-billing-stack" ]; then
    install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  fi
  if [ -f "$APP_DIR/deploy/bin/fakenet-billing-update" ]; then
    install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  fi

  if [ -d "$APP_DIR/deploy/systemd" ]; then
    local unit
    for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.target; do
      install_systemd_unit_file "$unit"
    done
    cleanup_obsolete_worker_runtime
    systemctl daemon-reload >/dev/null 2>&1 || true
    if [ "${INSTALL_GENIEACS:-1}" != "0" ] && [ -f "$GENIEACS_ENV_FILE" ]; then
      local docker_unit
      command -v genieacs-cwmp >/dev/null 2>&1 || INSTALL_GENIEACS=1 install_genieacs_runtime
      prepare_genieacs_runtime
      docker_unit="$(resolve_systemd_group docker.service || true)"
      [ -n "$docker_unit" ] && systemctl start "$docker_unit" >/dev/null 2>&1 || true
      ensure_genieacs_mongodb_image
      systemctl enable "${GENIEACS_UNITS[@]}" >/dev/null 2>&1 || true
      systemctl restart "${GENIEACS_UNITS[@]}"
      verify_genieacs_health
      bootstrap_genieacs
    fi
  fi

  if [ "${GENIEACS_EXTERNAL_DETECTED:-0}" = "1" ] && [ -f "$GENIEACS_ENV_FILE" ]; then
    bootstrap_genieacs
  fi
  sync_genieacs_virtual_parameters

  if [ -f /etc/fakenet-billing.env ] && [ "${REPAIR_FREERADIUS:-1}" != "0" ]; then
    configure_freeradius_sql
    validate_freeradius_config
  fi

  if [ "${REPAIR_FREERADIUS:-1}" = "0" ]; then
    :
  else
    restart_systemd_unit_group "freeradius.service radiusd.service"
  fi

  echo "Repair selesai."
}

has_uninstall_arg() {
  local needle="$1" arg
  shift || true
  for arg in "$@"; do
    [ "$arg" = "$needle" ] && return 0
  done
  return 1
}

confirm_uninstall() {
  if [ "${FAKENET_UNINSTALL_CONFIRM:-}" = "YES" ] || has_uninstall_arg "--yes" "$@"; then
    return 0
  fi
  echo "PERINGATAN: uninstall total akan menghapus aplikasi, service, env, database Billing/Radius, data GenieACS lokal, log, backup, dan session WAHA."
  if [ "${FAKENET_PURGE_DEPENDENCIES:-}" = "YES" ] || has_uninstall_arg "--purge-deps" "$@"; then
    echo "Mode purge dependency aktif: paket OS pendukung seperti PostgreSQL, Redis, FreeRADIUS, Docker, Node.js, SNMP tools, dan Tesseract juga akan dicabut."
  fi
  echo "License key lama tetap bisa dipakai lagi jika install ulang di mesin/HWID yang sama."
  printf 'Ketik HAPUS untuk lanjut: '
  read -r answer
  if [ "$answer" != "HAPUS" ]; then
    echo "Uninstall dibatalkan."
    exit 1
  fi
}

drop_database_if_exists() {
  local db_name="$1"
  [ -n "$db_name" ] || return 0
  if ! command -v psql >/dev/null 2>&1; then
    return 0
  fi
  psql_superuser -X -q -v ON_ERROR_STOP=1 -v db="$db_name" -d postgres <<'SQL' || true
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = :'db';
DROP DATABASE IF EXISTS :"db";
SQL
}

drop_role_if_exists() {
  local role_name="$1"
  [ -n "$role_name" ] || return 0
  if ! command -v psql >/dev/null 2>&1; then
    return 0
  fi
  psql_superuser -X -q -v ON_ERROR_STOP=1 -v role="$role_name" -d postgres <<'SQL' || true
DROP ROLE IF EXISTS :"role";
SQL
}

cleanup_bullmq_redis() {
  command -v redis-cli >/dev/null 2>&1 || return 0
  local redis_url prefix key
  redis_url="${REDIS_URL:-redis://127.0.0.1:6379/0}"
  prefix="${WA_BULLMQ_PREFIX:-fakenet-billing:bullmq}"
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    redis-cli -u "$redis_url" UNLINK "$key" >/dev/null 2>&1 || true
  done < <(redis-cli -u "$redis_url" --scan --pattern "${prefix}:*" 2>/dev/null || true)
}

purge_dependency_packages() {
  if [ "${FAKENET_PURGE_DEPENDENCIES:-}" != "YES" ] && ! has_uninstall_arg "--purge-deps" "$@"; then
    echo "Paket OS pendukung tidak dihapus. Jalankan uninstall dengan --purge-deps jika mesin khusus untuk billing dan ingin bersih total."
    return 0
  fi

  local pm
  pm="$(detect_pm)"
  echo "Menghapus paket OS pendukung installer billing..."
  case "$pm" in
    apt)
      DEBIAN_FRONTEND=noninteractive apt-get purge -y \
        postgresql postgresql-client redis-server freeradius freeradius-postgresql freeradius-utils snmp docker.io tesseract-ocr nodejs npm \
        >/dev/null 2>&1 || true
      DEBIAN_FRONTEND=noninteractive apt-get autoremove -y >/dev/null 2>&1 || true
      ;;
    *)
      echo "Purge dependency otomatis hanya tersedia untuk Debian/Ubuntu apt." >&2
      ;;
  esac
}

uninstall_total() {
  confirm_uninstall "$@"

  local app_db app_user radius_db radius_user service radius_unit
  if [ -f /etc/fakenet-billing.env ]; then
    load_billing_env
  fi
  app_db="${APP_DATABASE_NAME:-fakenet_billing}"
  app_user="${APP_DATABASE_USER:-fakenet_billing}"
  radius_db="${RADIUS_DATABASE_NAME:-radius}"
  radius_user="${RADIUS_DATABASE_USER:-radius}"

  systemctl stop fakenet-billing-stack.target "${APP_UNITS[@]}" >/dev/null 2>&1 || true
  systemctl disable fakenet-billing-stack.target "${APP_UNITS[@]}" >/dev/null 2>&1 || true
  radius_unit="$(resolve_systemd_group freeradius.service radiusd.service || true)"
  if [ -n "$radius_unit" ]; then
    systemctl stop "$radius_unit" >/dev/null 2>&1 || true
    systemctl disable "$radius_unit" >/dev/null 2>&1 || true
  fi
  rm -f /etc/systemd/system/fakenet-billing*.service /etc/systemd/system/fakenet-billing-stack.target
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl reset-failed >/dev/null 2>&1 || true

  if command -v docker >/dev/null 2>&1; then
    docker rm -f fakenet-billing-waha >/dev/null 2>&1 || true
    docker rm -f fakenet-billing-genieacs-mongodb >/dev/null 2>&1 || true
  fi

  cleanup_bullmq_redis

  drop_database_if_exists "$app_db"
  drop_database_if_exists "$radius_db"
  drop_role_if_exists "$app_user"
  drop_role_if_exists "$radius_user"

  rm -rf \
    "$APP_DIR" \
    /opt/fakenet-billing-waha \
    /opt/fakenet-billing-genieacs \
    /etc/fakenet-billing.env \
    /etc/fakenet-billing-waha.env \
    "$GENIEACS_ENV_FILE" \
    /var/log/fakenet-billing \
    /var/backups/fakenet-billing \
    /usr/local/bin/fakenet-billing-stack \
    /usr/local/bin/fakenet-billing-update \
    /usr/local/bin/fakenet-billing-uninstall

  purge_dependency_packages "$@"

  echo "Uninstall total selesai."
}

main() {
  need_root
  require_debian_ubuntu_systemd
  case "${1:-install}" in
    uninstall|--uninstall)
      shift || true
      uninstall_total "$@"
      return 0
      ;;
    repair|--repair)
      if [ ! -f "$GENIEACS_ENV_FILE" ]; then
        INSTALL_GENIEACS=0
      fi
      auto_skip_existing_genieacs
      repair_install
      return 0
      ;;
    install|"")
      ;;
    *)
      echo "Usage: bash install.sh [install|repair|uninstall] [--yes] [--purge-deps]" >&2
      exit 2
      ;;
  esac
  verify_repository_payload
  install_packages
  install_ocr_runtime
  install_node_runtime
  check_node
  ensure_required_commands
  auto_skip_existing_genieacs
  copy_source
  install_node_deps
  if [ "${INSTALL_GENIEACS:-1}" != "0" ]; then
    install_genieacs_runtime
  fi
  install_env
  mkdir -p /opt/fakenet-billing-waha/sessions
  install_systemd
  verify_billing_health
  echo "Install selesai."
  echo "Billing: http://SERVER-IP:8891"
  echo "Isolir: http://SERVER-IP:8892/isolir"
  echo "Voucher: http://SERVER-IP:8893/voucher"
  echo "WifiKu: http://SERVER-IP:8894/wifiku"
  echo "Login Billing awal: $(read_env_value_raw /etc/fakenet-billing.env APP_ADMIN_USERNAME || echo admin) / $(read_env_value_raw /etc/fakenet-billing.env APP_ADMIN_PASSWORD || true)"
  if [ "${INSTALL_GENIEACS:-1}" != "0" ] && [ -f "$GENIEACS_ENV_FILE" ]; then
    load_genieacs_env
    echo "GenieACS CWMP: http://SERVER-IP:${GENIEACS_CWMP_PORT:-7547}"
    echo "GenieACS UI: http://SERVER-IP:${GENIEACS_UI_PORT:-7568}"
    echo "GenieACS NBI: 127.0.0.1:${GENIEACS_NBI_PORT:-7557} (localhost only)"
    echo "Login GenieACS awal: ${GENIEACS_UI_USERNAME:-billing} / ${GENIEACS_UI_PASSWORD:-billing123}"
    echo "Inform CPE: ${GENIEACS_CWMP_AUTH_USERNAME:-admin} / ${GENIEACS_CWMP_AUTH_PASSWORD:-1sampai10}"
  elif [ "${GENIEACS_EXTERNAL_DETECTED:-0}" = "1" ]; then
    echo "GenieACS existing terdeteksi; GenieACS bawaan billing dilewati."
    echo "GenieACS NBI existing dikunci ke 127.0.0.1:7557 jika service genieacs-nbi tersedia."
  fi
  echo "Service stack: fakenet-billing-stack {start|restart|stop|status|update}"
}

main "$@"

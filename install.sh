#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fakenet-billing}"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
INSTALL_LICENSE_SERVER="${INSTALL_LICENSE_SERVER:-0}"
NODE_MIN_MAJOR="${NODE_MIN_MAJOR:-18}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Jalankan sebagai root: sudo bash install.sh" >&2
    exit 1
  fi
}

detect_pm() {
  if command -v apt-get >/dev/null 2>&1; then echo apt; return; fi
  if command -v dnf >/dev/null 2>&1; then echo dnf; return; fi
  if command -v yum >/dev/null 2>&1; then echo yum; return; fi
  if command -v apk >/dev/null 2>&1; then echo apk; return; fi
  echo unknown
}

install_packages() {
  pm="$(detect_pm)"
  case "$pm" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git rsync tar gzip nodejs npm postgresql redis-server freeradius docker.io
      ;;
    dnf)
      dnf install -y ca-certificates curl git rsync tar gzip nodejs npm postgresql-server postgresql redis freeradius docker
      ;;
    yum)
      yum install -y ca-certificates curl git rsync tar gzip nodejs npm postgresql-server postgresql redis freeradius docker
      ;;
    apk)
      apk add --no-cache ca-certificates curl git rsync tar gzip nodejs npm postgresql postgresql-client redis freeradius docker openrc
      ;;
    *)
      echo "Package manager tidak dikenali. Install manual: nodejs npm git rsync postgresql redis freeradius docker." >&2
      ;;
  esac
}

check_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js belum terpasang" >&2
    exit 1
  fi
  major="$(node -p "Number(process.versions.node.split('.')[0])")"
  if [ "$major" -lt "$NODE_MIN_MAJOR" ]; then
    echo "Node.js minimal v$NODE_MIN_MAJOR. Versi saat ini: $(node -v)" >&2
    echo "Update Node.js dahulu, lalu ulangi install.sh." >&2
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
  cd "$APP_DIR"
  if [ -f package-lock.json ]; then
    npm ci --omit=dev
  else
    npm install --omit=dev
  fi
}

install_env() {
  if [ ! -f /etc/fakenet-billing.env ]; then
    cp "$APP_DIR/deploy/fakenet-billing.env" /etc/fakenet-billing.env
    if [ -n "${FAKENET_LICENSE_PUBLIC_KEY:-}" ]; then
      escaped_public_key="$(printf '%s' "$FAKENET_LICENSE_PUBLIC_KEY" | sed ':a;N;$!ba;s/\n/\\n/g')"
      printf '\nLICENSE_PUBLIC_KEY="%s"\n' "$escaped_public_key" >> /etc/fakenet-billing.env
    fi
  fi
  if [ ! -f /etc/fakenet-billing-waha.env ]; then
    cp "$APP_DIR/deploy/fakenet-billing-waha.env" /etc/fakenet-billing-waha.env
    waha_api_key="$(openssl rand -hex 32 2>/dev/null || date +%s%N)"
    waha_password="$(openssl rand -hex 24 2>/dev/null || date +%s%N)"
    sed -i "s/CHANGE_ME_LONG_RANDOM_API_KEY/$waha_api_key/g" /etc/fakenet-billing-waha.env
    sed -i "s/CHANGE_ME_LONG_RANDOM_PASSWORD/$waha_password/g" /etc/fakenet-billing-waha.env
  fi
  if [ "$INSTALL_LICENSE_SERVER" = "1" ] && [ ! -f /etc/fakenet-billing-license.env ]; then
    cp "$APP_DIR/deploy/fakenet-billing-license.env" /etc/fakenet-billing-license.env
    token="$(openssl rand -hex 24 2>/dev/null || date +%s%N)"
    sed -i "s/change-this-license-admin-token/$token/g" /etc/fakenet-billing-license.env
  fi
}

install_systemd() {
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.target; do
    [ -f "$unit" ] || continue
    name="$(basename "$unit")"
    if [ "$name" = "fakenet-billing-license.service" ] && [ "$INSTALL_LICENSE_SERVER" != "1" ]; then
      continue
    fi
    sed "s#WorkingDirectory=/opt/fakenet-billing#WorkingDirectory=$APP_DIR#g" "$unit" > "/etc/systemd/system/$name"
  done
  systemctl daemon-reload
  systemctl enable redis-server postgresql freeradius docker >/dev/null 2>&1 || true
  systemctl start redis-server postgresql freeradius docker >/dev/null 2>&1 || true
  systemctl enable fakenet-billing.service fakenet-billing-isolir.service fakenet-billing-voucher.service fakenet-billing-wifiku.service fakenet-billing-radius-connector.service >/dev/null
  systemctl restart fakenet-billing.service fakenet-billing-isolir.service fakenet-billing-voucher.service fakenet-billing-wifiku.service fakenet-billing-radius-connector.service
  if [ "$INSTALL_LICENSE_SERVER" = "1" ]; then
    systemctl enable fakenet-billing-license.service >/dev/null
    systemctl restart fakenet-billing-license.service
  fi
}

write_openrc_service() {
  service_name="$1"
  command_args="$2"
  cat > "/etc/init.d/$service_name" <<EOF
#!/sbin/openrc-run
name="$service_name"
description="$service_name"
supervisor=supervise-daemon
directory="$APP_DIR"
command="/usr/bin/node"
command_args="$command_args"
command_user="root"
pidfile="/run/$service_name.pid"
output_log="/var/log/$service_name.log"
error_log="/var/log/$service_name.err"
[ -f /etc/fakenet-billing.env ] && . /etc/fakenet-billing.env
[ -f /etc/fakenet-billing-license.env ] && . /etc/fakenet-billing-license.env
depend() {
  need net
}
EOF
  chmod +x "/etc/init.d/$service_name"
  rc-update add "$service_name" default
  rc-service "$service_name" restart || rc-service "$service_name" start
}

install_openrc() {
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  mkdir -p /var/log/fakenet-billing
  rc-update add redis default >/dev/null 2>&1 || true
  rc-update add postgresql default >/dev/null 2>&1 || true
  rc-update add freeradius default >/dev/null 2>&1 || true
  rc-update add docker default >/dev/null 2>&1 || true
  rc-service redis start >/dev/null 2>&1 || true
  rc-service postgresql start >/dev/null 2>&1 || true
  rc-service freeradius start >/dev/null 2>&1 || true
  rc-service docker start >/dev/null 2>&1 || true
  write_openrc_service fakenet-billing "src/server.js"
  write_openrc_service fakenet-billing-isolir "src/subweb-server.js"
  sed -i 's#command_args="src/subweb-server.js"#command_args="src/subweb-server.js"\nexport SUBWEB_KIND=isolir#' /etc/init.d/fakenet-billing-isolir
  write_openrc_service fakenet-billing-voucher "src/subweb-server.js"
  sed -i 's#command_args="src/subweb-server.js"#command_args="src/subweb-server.js"\nexport SUBWEB_KIND=voucher#' /etc/init.d/fakenet-billing-voucher
  write_openrc_service fakenet-billing-wifiku "src/subweb-server.js"
  sed -i 's#command_args="src/subweb-server.js"#command_args="src/subweb-server.js"\nexport SUBWEB_KIND=wifiku#' /etc/init.d/fakenet-billing-wifiku
  write_openrc_service fakenet-billing-radius-connector "src/radius-connector-service.js"
  if [ "$INSTALL_LICENSE_SERVER" = "1" ]; then
    write_openrc_service fakenet-billing-license "src/license-server.js"
  fi
}

main() {
  need_root
  install_packages
  check_node
  copy_source
  install_node_deps
  install_env
  if command -v systemctl >/dev/null 2>&1; then
    install_systemd
  elif command -v rc-service >/dev/null 2>&1; then
    install_openrc
  else
    echo "Service manager tidak dikenali. Source sudah dipasang di $APP_DIR." >&2
  fi
  echo "Install selesai."
  echo "Billing: http://SERVER-IP:8891"
  echo "Isolir: http://SERVER-IP:8892/isolir"
  echo "Voucher: http://SERVER-IP:8893/voucher"
  echo "WifiKu: http://SERVER-IP:8894/wifiku"
  if [ "$INSTALL_LICENSE_SERVER" = "1" ]; then
    echo "License Generator: http://SERVER-IP:8896"
  fi
}

main "$@"

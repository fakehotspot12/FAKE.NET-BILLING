#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fakenet-billing}"
LOCK_FILE="${FAKENET_UPDATE_LOCK:-/tmp/fakenet-billing-update.lock}"
LOCK_MAX_AGE_SECONDS="${FAKENET_UPDATE_LOCK_MAX_AGE_SECONDS:-3600}"
RAW_BASE_URL="${FAKENET_UPDATE_RAW_BASE_URL:-https://raw.githubusercontent.com/fakehotspot12/FAKE.NET-BILLING/main}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Jalankan sebagai root: sudo bash bootstrap-update.sh" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "Folder aplikasi tidak ditemukan: $APP_DIR" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl belum tersedia." >&2
  exit 1
fi

if [ -e "$LOCK_FILE" ]; then
  lock_pid="$(cat "$LOCK_FILE" 2>/dev/null || true)"
  lock_age="$(( $(date +%s) - $(stat -c %Y "$LOCK_FILE" 2>/dev/null || echo 0) ))"
  lock_command=""
  if [ -n "$lock_pid" ] && kill -0 "$lock_pid" 2>/dev/null; then
    lock_command="$(tr '\0' ' ' < "/proc/$lock_pid/cmdline" 2>/dev/null || true)"
  fi
  if printf '%s' "$lock_command" | grep -q 'fakenet-billing-update' \
    && [ "$lock_age" -lt "$LOCK_MAX_AGE_SECONDS" ]; then
    echo "Updater masih aktif pada PID $lock_pid. Tunggu proses selesai sebelum bootstrap." >&2
    exit 1
  fi
  rm -f "$LOCK_FILE"
  echo "Lock update stale dibersihkan."
fi

tmp_updater="$(mktemp)"
trap 'rm -f "$tmp_updater"' EXIT
curl -fsSL --retry 3 --connect-timeout 10 \
  "$RAW_BASE_URL/deploy/bin/fakenet-billing-update" \
  -o "$tmp_updater"

if ! head -n 1 "$tmp_updater" | grep -q '^#!/usr/bin/env bash'; then
  echo "Updater dari repository tidak valid." >&2
  exit 1
fi

chmod 0700 "$tmp_updater"
echo "Menjalankan updater terbaru dari repository..."
APP_DIR="$APP_DIR" FAKENET_UPDATE_LOCK="$LOCK_FILE" bash "$tmp_updater"

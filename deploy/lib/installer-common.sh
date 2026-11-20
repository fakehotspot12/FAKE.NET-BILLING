#!/usr/bin/env bash

os_version_supported() {
  case "$1:$2" in ubuntu:24.04|debian:12) return 0 ;; *) return 1 ;; esac
}

require_supported_os() {
  local ID="" VERSION_ID=""
  [ -r /etc/os-release ] && . /etc/os-release
  if ! os_version_supported "$ID" "$VERSION_ID" || ! command -v apt-get >/dev/null || ! command -v systemctl >/dev/null; then
    echo "ERROR: install, repair, dan update hanya mendukung Ubuntu 24.04 LTS atau Debian 12 dengan systemd." >&2
    return 1
  fi
}

verify_release_payload() {
  local root="$1" file manifest="$1/deploy/release-files.list" count=0
  [ -f "$manifest" ] && [ ! -L "$manifest" ] || { echo "ERROR: manifest rilis tidak tersedia." >&2; return 1; }
  while IFS= read -r file || [ -n "$file" ]; do
    case "$file" in ''|'#'*) continue ;; esac
    case "$file" in /*|*..*|*[!A-Za-z0-9_./-]*|data/*|node_modules/*|.git/*|.env)
      echo "ERROR: jalur manifest tidak aman: $file" >&2; return 1 ;;
    esac
    [ -f "$root/$file" ] && [ ! -L "$root/$file" ] || {
      echo "ERROR: rilis tidak lengkap, berkas tidak ditemukan: $file" >&2; return 1;
    }
    count=$((count + 1))
  done < "$manifest"
  [ "$count" -gt 200 ] || { echo "ERROR: manifest rilis terpotong." >&2; return 1; }
  echo "Payload rilis lengkap: $count berkas."
}

installation_preflight() {
  local root="$1" mode="${2:-install}" bundled="${3:-0}" free_mb memory_kb min_mb
  require_supported_os || return 1
  if [ "$bundled" = 1 ] && [ "$(uname -m)" = x86_64 ] && ! grep -qiw avx /proc/cpuinfo; then
    echo "ERROR: MongoDB 7 memerlukan CPU AVX. Aktifkan CPU host/passthrough pada VM sebelum memasang ACS lokal." >&2
    return 1
  fi
  while [ ! -d "$root" ]; do root="$(dirname "$root")"; done
  free_mb="$(df -Pm "$root" | awk 'NR==2 {print $4}')"
  min_mb=2048
  [ "$mode" != install ] || [ "$bundled" != 1 ] || min_mb=6144
  if [ "${free_mb:-0}" -lt "$min_mb" ]; then
    echo "ERROR: disk kosong minimal ${min_mb} MB diperlukan untuk staging, dependency, dan backup." >&2
    return 1
  fi
  memory_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
  if [ "${memory_kb:-0}" -lt 1000000 ] || { [ "$bundled" = 1 ] && [ "${memory_kb:-0}" -lt 2000000 ]; }; then
    echo "ERROR: RAM tidak mencukupi. Minimal 2 GB untuk ACS lokal; 4-8 GB lebih disarankan." >&2
    return 1
  fi
  if [ "$bundled" = 1 ] && [ "$memory_kb" -lt 4000000 ]; then
    echo "PERINGATAN: RAM di bawah 4 GB; instalasi lengkap berisiko kehabisan memori."
  fi
  echo "Preflight OS yang didukung, CPU, RAM dan disk berhasil."
}

verify_runtime_health() {
  local root="$1" attempt
  for attempt in $(seq 1 "${FAKENET_HEALTH_ATTEMPTS:-15}"); do
    if node "$root/deploy/runtime-health.js" "$root"; then return 0; fi
    [ "$attempt" -ge "${FAKENET_HEALTH_ATTEMPTS:-15}" ] || sleep 2
  done
  echo "ERROR: pemeriksaan komponen gagal; instalasi/update belum dinyatakan berhasil." >&2
  return 1
}

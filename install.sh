#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/fakenet-billing}"
SOURCE_DIR="${SOURCE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
NODE_MIN_MAJOR="${NODE_MIN_MAJOR:-18}"
NODE_SETUP_MAJOR="${NODE_SETUP_MAJOR:-20}"

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
  if command -v dnf >/dev/null 2>&1; then echo dnf; return; fi
  if command -v yum >/dev/null 2>&1; then echo yum; return; fi
  if command -v apk >/dev/null 2>&1; then echo apk; return; fi
  echo unknown
}

detect_os_id() {
  if [ -r /etc/os-release ]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    printf '%s\n' "${ID:-unknown}"
    return
  fi
  echo unknown
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

configure_rhel_repositories() {
  local pm="$1"
  "$pm" install -y ca-certificates curl >/dev/null 2>&1 || true
  case "$pm" in
    dnf)
      "$pm" install -y dnf-plugins-core epel-release >/dev/null 2>&1 || true
      dnf config-manager --set-enabled crb >/dev/null 2>&1 || dnf config-manager --set-enabled powertools >/dev/null 2>&1 || true
      ;;
    yum)
      "$pm" install -y yum-utils epel-release >/dev/null 2>&1 || true
      yum-config-manager --enable crb >/dev/null 2>&1 || yum-config-manager --enable powertools >/dev/null 2>&1 || true
      ;;
  esac
}

install_rhel_packages() {
  local pm="$1"
  configure_rhel_repositories "$pm"
  "$pm" install -y ca-certificates curl git rsync tar gzip openssl postgresql-server postgresql redis freeradius freeradius-postgresql
  if ! command -v docker >/dev/null 2>&1; then
    "$pm" install -y docker || "$pm" install -y moby-engine || "$pm" install -y docker-ce || true
  fi
}

install_packages() {
  local pm
  pm="$(detect_pm)"
  case "$pm" in
    apt)
      apt-get update
      DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git rsync tar gzip gnupg openssl postgresql postgresql-client redis-server freeradius freeradius-postgresql docker.io
      ;;
    dnf)
      install_rhel_packages dnf
      ;;
    yum)
      install_rhel_packages yum
      ;;
    apk)
      apk add --no-cache bash ca-certificates curl git rsync tar gzip openssl nodejs npm postgresql postgresql-client redis freeradius freeradius-postgresql docker openrc su-exec
      ;;
    *)
      echo "Package manager tidak dikenali. Install manual: nodejs npm git rsync postgresql redis freeradius docker." >&2
      ;;
  esac
}

ensure_required_commands() {
  local missing=() cmd
  for cmd in git rsync tar gzip openssl psql pg_dump node npm docker; do
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
    dnf)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" -o "$setup"
      bash "$setup"
      dnf install -y nodejs
      ;;
    yum)
      curl -fsSL "https://rpm.nodesource.com/setup_${NODE_SETUP_MAJOR}.x" -o "$setup"
      bash "$setup"
      yum install -y nodejs
      ;;
    apk)
      apk add --no-cache nodejs npm
      ;;
    *)
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
  node -e "require('bullmq'); require('./src/whatsapp-queue')" >/dev/null
}

verify_billing_health() {
  local attempt payload
  for attempt in $(seq 1 30); do
    payload="$(curl -fsS --max-time 3 http://127.0.0.1:8891/api/health 2>/dev/null || true)"
    if printf '%s' "$payload" | grep -q '"ok":true' \
      && printf '%s' "$payload" | grep -q '"backend":"bullmq"' \
      && printf '%s' "$payload" | grep -q '"available":true'; then
      echo "Health check Billing dan BullMQ berhasil."
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

install_env() {
  local app_db_password radius_db_password waha_api_key waha_password waha_webhook_secret
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
}

load_billing_env() {
  set -a
  # shellcheck disable=SC1091
  . /etc/fakenet-billing.env
  set +a
}

systemd_unit_exists() {
  systemctl list-unit-files "$1" --no-legend >/dev/null 2>&1
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
  sed \
    -e "s#WorkingDirectory=/opt/fakenet-billing#WorkingDirectory=$APP_DIR#g" \
    -e "s#/opt/fakenet-billing-waha#/opt/fakenet-billing-waha#g" \
    "$unit" > "/etc/systemd/system/$name"
  rewrite_systemd_unit_dependencies "/etc/systemd/system/$name"
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
  if command -v postgresql-setup >/dev/null 2>&1; then
    postgresql-setup --initdb >/dev/null 2>&1 || true
  fi
  if command -v rc-service >/dev/null 2>&1 && [ -x /etc/init.d/postgresql ]; then
    rc-service postgresql setup >/dev/null 2>&1 || true
  fi
}

psql_superuser() {
  if command -v runuser >/dev/null 2>&1; then
    runuser -u postgres -- psql "$@"
  elif command -v su-exec >/dev/null 2>&1; then
    su-exec postgres psql "$@"
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
    /etc/freeradius/3.0/mods-config/sql/main/postgresql/queries.conf \
    /etc/raddb/mods-available/sql \
    /etc/raddb/mods-enabled/sql \
    /etc/raddb/mods-config/sql/main/postgresql/queries.conf; do
    if [ -f "$candidate" ]; then
      configure_freeradius_sql_file "$candidate" "$radius_db_conn"
      configured=1
    fi
  done
  [ "$configured" -eq 1 ] || return 0

  for mods_base in /etc/freeradius/3.0 /etc/raddb; do
    mods_enabled="$mods_base/mods-enabled"
    if [ -d "$mods_enabled" ]; then
      ln -sf ../mods-available/sql "$mods_enabled/sql" || true
      [ -L "$mods_enabled/sqlippool" ] && rm -f "$mods_enabled/sqlippool" || true
    fi
  done

  for candidate in /etc/freeradius/3.0/mods-enabled/sql /etc/raddb/mods-enabled/sql; do
    [ -f "$candidate" ] && configure_freeradius_sql_file "$candidate" "$radius_db_conn"
  done

  for sites_default in /etc/freeradius/3.0/sites-enabled/default /etc/raddb/sites-enabled/default; do
    configure_freeradius_site_file "$sites_default"
  done
  for sites_inner in /etc/freeradius/3.0/sites-enabled/inner-tunnel /etc/raddb/sites-enabled/inner-tunnel; do
    configure_freeradius_site_file "$sites_inner"
  done
}

install_systemd() {
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  local unit
  for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.target; do
    install_systemd_unit_file "$unit"
  done
  systemctl daemon-reload
  init_postgres_cluster
  start_systemd_base_units
  init_postgres_databases
  configure_freeradius_sql
  restart_systemd_unit_group "freeradius.service radiusd.service"
  systemctl enable fakenet-billing-stack.target "${APP_UNITS[@]}" >/dev/null 2>&1 || true
  systemctl restart "${APP_UNITS[@]}"
}

write_openrc_service() {
  local service_name="$1" command_args="$2" subweb_kind="${3:-}"
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
export NODE_ENV="\${NODE_ENV:-production}"
if [ -n "$subweb_kind" ]; then
  export SUBWEB_KIND="$subweb_kind"
fi
depend() {
  need net
}
EOF
  chmod +x "/etc/init.d/$service_name"
  rc-update add "$service_name" default >/dev/null 2>&1 || true
  rc-service "$service_name" restart || rc-service "$service_name" start || true
}

write_openrc_waha_service() {
  cat > /etc/init.d/fakenet-billing-waha <<EOF
#!/sbin/openrc-run
name="fakenet-billing-waha"
description="WAHA Local WhatsApp Gateway for FAKE.NET Billing"
supervisor=supervise-daemon
command="/usr/bin/docker"
[ -f /etc/fakenet-billing-waha.env ] && . /etc/fakenet-billing-waha.env
WAHA_PORT="\${WAHA_PORT:-8895}"
command_args="run --name fakenet-billing-waha --rm --shm-size=1g --add-host=host.docker.internal:host-gateway --env-file /etc/fakenet-billing-waha.env -p 127.0.0.1:\${WAHA_PORT}:3000 -v /opt/fakenet-billing-waha/sessions:/app/.sessions devlikeapro/waha"
pidfile="/run/fakenet-billing-waha.pid"
output_log="/var/log/fakenet-billing-waha.log"
error_log="/var/log/fakenet-billing-waha.err"
start_pre() {
  mkdir -p /opt/fakenet-billing-waha/sessions
  /usr/bin/docker rm -f fakenet-billing-waha >/dev/null 2>&1 || true
}
stop_post() {
  /usr/bin/docker stop fakenet-billing-waha >/dev/null 2>&1 || true
}
depend() {
  need docker net
}
EOF
  chmod +x /etc/init.d/fakenet-billing-waha
  rc-update add fakenet-billing-waha default >/dev/null 2>&1 || true
  rc-service fakenet-billing-waha restart || rc-service fakenet-billing-waha start || true
}

install_openrc() {
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  mkdir -p /var/log/fakenet-billing
  init_postgres_cluster
  rc-update add redis default >/dev/null 2>&1 || true
  rc-update add postgresql default >/dev/null 2>&1 || true
  rc-update add freeradius default >/dev/null 2>&1 || rc-update add radiusd default >/dev/null 2>&1 || true
  rc-update add docker default >/dev/null 2>&1 || true
  rc-service redis start >/dev/null 2>&1 || true
  rc-service postgresql start >/dev/null 2>&1 || true
  rc-service freeradius start >/dev/null 2>&1 || rc-service radiusd start >/dev/null 2>&1 || true
  rc-service docker start >/dev/null 2>&1 || true
  init_postgres_databases
  configure_freeradius_sql
  rc-service freeradius restart >/dev/null 2>&1 || rc-service radiusd restart >/dev/null 2>&1 || true
  write_openrc_service fakenet-billing "src/server.js"
  write_openrc_service fakenet-billing-isolir "src/subweb-server.js" "isolir"
  write_openrc_service fakenet-billing-voucher "src/subweb-server.js" "voucher"
  write_openrc_service fakenet-billing-wifiku "src/subweb-server.js" "wifiku"
  write_openrc_service fakenet-billing-radius-connector "src/radius-connector-service.js"
  write_openrc_waha_service
}

repair_install() {
  mkdir -p /var/log/fakenet-billing
  install_env

  if [ -f "$APP_DIR/deploy/bin/fakenet-billing-stack" ]; then
    install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-stack" /usr/local/bin/fakenet-billing-stack
  fi
  if [ -f "$APP_DIR/deploy/bin/fakenet-billing-update" ]; then
    install -m 0755 "$APP_DIR/deploy/bin/fakenet-billing-update" /usr/local/bin/fakenet-billing-update
  fi

  if command -v systemctl >/dev/null 2>&1 && [ -d "$APP_DIR/deploy/systemd" ]; then
    local unit
    for unit in "$APP_DIR"/deploy/systemd/*.service "$APP_DIR"/deploy/systemd/*.target; do
      install_systemd_unit_file "$unit"
    done
    systemctl daemon-reload >/dev/null 2>&1 || true
  elif command -v rc-service >/dev/null 2>&1; then
    write_openrc_service fakenet-billing "src/server.js"
    write_openrc_service fakenet-billing-isolir "src/subweb-server.js" "isolir"
    write_openrc_service fakenet-billing-voucher "src/subweb-server.js" "voucher"
    write_openrc_service fakenet-billing-wifiku "src/subweb-server.js" "wifiku"
    write_openrc_service fakenet-billing-radius-connector "src/radius-connector-service.js"
    write_openrc_waha_service
  fi

  if [ -f /etc/fakenet-billing.env ] && [ "${REPAIR_FREERADIUS:-1}" != "0" ]; then
    configure_freeradius_sql
    validate_freeradius_config
  fi

  if [ "${REPAIR_FREERADIUS:-1}" = "0" ]; then
    :
  elif command -v systemctl >/dev/null 2>&1; then
    restart_systemd_unit_group "freeradius.service radiusd.service"
  elif command -v rc-service >/dev/null 2>&1; then
    rc-service freeradius restart >/dev/null 2>&1 || rc-service radiusd restart >/dev/null 2>&1 || true
  fi

  echo "Repair selesai."
}

confirm_uninstall() {
  if [ "${FAKENET_UNINSTALL_CONFIRM:-}" = "YES" ] || [ "${1:-}" = "--yes" ]; then
    return 0
  fi
  echo "PERINGATAN: uninstall total akan menghapus aplikasi, service, env, database, log, backup, dan session WAHA."
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

uninstall_total() {
  confirm_uninstall "${1:-}"

  local app_db app_user radius_db radius_user service radius_unit
  if [ -f /etc/fakenet-billing.env ]; then
    load_billing_env
  fi
  app_db="${APP_DATABASE_NAME:-fakenet_billing}"
  app_user="${APP_DATABASE_USER:-fakenet_billing}"
  radius_db="${RADIUS_DATABASE_NAME:-radius}"
  radius_user="${RADIUS_DATABASE_USER:-radius}"

  if command -v systemctl >/dev/null 2>&1; then
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
  fi

  if command -v rc-service >/dev/null 2>&1; then
    for service in fakenet-billing fakenet-billing-isolir fakenet-billing-voucher fakenet-billing-wifiku fakenet-billing-radius-connector fakenet-billing-waha; do
      rc-service "$service" stop >/dev/null 2>&1 || true
      rc-update del "$service" default >/dev/null 2>&1 || true
      rm -f "/etc/init.d/$service"
    done
    rc-service freeradius stop >/dev/null 2>&1 || rc-service radiusd stop >/dev/null 2>&1 || true
    rc-update del freeradius default >/dev/null 2>&1 || rc-update del radiusd default >/dev/null 2>&1 || true
  fi

  if command -v docker >/dev/null 2>&1; then
    docker rm -f fakenet-billing-waha >/dev/null 2>&1 || true
  fi

  cleanup_bullmq_redis

  drop_database_if_exists "$app_db"
  drop_database_if_exists "$radius_db"
  drop_role_if_exists "$app_user"
  drop_role_if_exists "$radius_user"

  rm -rf \
    "$APP_DIR" \
    /opt/fakenet-billing-waha \
    /etc/fakenet-billing.env \
    /etc/fakenet-billing-waha.env \
    /var/log/fakenet-billing \
    /var/backups/fakenet-billing \
    /usr/local/bin/fakenet-billing-stack \
    /usr/local/bin/fakenet-billing-update

  echo "Uninstall total selesai. Paket OS seperti PostgreSQL, Redis, FreeRADIUS, Docker, Node.js tidak dihapus karena bisa dipakai aplikasi lain."
}

main() {
  need_root
  case "${1:-install}" in
    uninstall|--uninstall)
      uninstall_total "${2:-}"
      return 0
      ;;
    repair|--repair)
      repair_install
      return 0
      ;;
    install|"")
      ;;
    *)
      echo "Usage: bash install.sh [install|repair|uninstall] [--yes]" >&2
      exit 2
      ;;
  esac
  install_packages
  install_node_runtime
  check_node
  ensure_required_commands
  copy_source
  install_node_deps
  install_env
  mkdir -p /opt/fakenet-billing-waha/sessions
  if command -v systemctl >/dev/null 2>&1; then
    install_systemd
  elif command -v rc-service >/dev/null 2>&1; then
    install_openrc
  else
    echo "Service manager tidak dikenali. Source sudah dipasang di $APP_DIR." >&2
  fi
  verify_billing_health
  echo "Install selesai."
  echo "Billing: http://SERVER-IP:8891"
  echo "Isolir: http://SERVER-IP:8892/isolir"
  echo "Voucher: http://SERVER-IP:8893/voucher"
  echo "WifiKu: http://SERVER-IP:8894/wifiku"
  echo "Service stack: fakenet-billing-stack {start|restart|stop|status|update}"
}

main "$@"

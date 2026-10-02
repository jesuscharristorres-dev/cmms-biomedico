#!/usr/bin/env bash
# scripts/migracion/entorno-prueba-local.sh
# Levanta un "Supabase local mínimo" para probar la migración SIN tocar ningún proyecto real:
# Postgres 16 + PostgREST (la misma API REST que usa Supabase) con los roles anon /
# authenticated / service_role y auth.jwt(). Storage se simula dentro de los tests.
#
# Requisitos: postgresql (initdb, pg_ctl, psql) y el binario `postgrest` (v12) en el PATH o en
# POSTGREST_BIN. Ubuntu/Debian: apt-get install postgresql; PostgREST:
# https://github.com/PostgREST/postgrest/releases
#
# Uso:
#   bash scripts/migracion/entorno-prueba-local.sh            # crea todo y aplica el esquema
#   source /tmp/cmms-supabase-local/env.sh && npm run test:supabase
#   bash scripts/migracion/entorno-prueba-local.sh --detener
set -euo pipefail

DIR=${CMMS_SUPABASE_LOCAL:-/tmp/cmms-supabase-local}
PGPORT=${PGPORT_LOCAL:-5433}
RESTPORT=${RESTPORT_LOCAL:-54321}
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
POSTGREST_BIN=${POSTGREST_BIN:-postgrest}
SECRETO="secreto-local-de-pruebas-de-32-caracteres-min"
RAIZ=$(cd "$(dirname "$0")/../.." && pwd)
SU=""; [ "$(id -u)" = "0" ] && SU=1

correr() { if [ -n "$SU" ]; then su postgres -c "$*"; else bash -c "$*"; fi; }

if [ "${1:-}" = "--detener" ]; then
  pkill -f "postgrest $DIR/postgrest.conf" || true
  correr "$PGBIN/pg_ctl -D $DIR/pg stop" || true
  exit 0
fi

mkdir -p "$DIR"; [ -n "$SU" ] && chown postgres "$DIR"
if [ ! -d "$DIR/pg" ]; then
  correr "$PGBIN/initdb -D $DIR/pg -A trust >/dev/null"
fi
correr "$PGBIN/pg_ctl -D $DIR/pg -o '-p $PGPORT -k /tmp -c listen_addresses=127.0.0.1' -l $DIR/pg.log start" >/dev/null || true
sleep 2
PSQL="psql -h 127.0.0.1 -p $PGPORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -tc "select 1 from pg_database where datname='cmms'" | grep -q 1 || $PSQL -c "create database cmms"
$PSQL -d cmms <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then create role authenticator login noinherit password 'local'; end if;
end $$;
grant anon, authenticated, service_role to authenticator;
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
SQL
for f in "$RAIZ"/supabase/migrations/*.sql; do $PSQL -d cmms -f "$f"; done

cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:local@127.0.0.1:$PGPORT/cmms"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SECRETO"
server-port = $RESTPORT
db-max-rows = 1000
CONF
pkill -f "postgrest $DIR/postgrest.conf" || true
nohup "$POSTGREST_BIN" "$DIR/postgrest.conf" > "$DIR/postgrest.log" 2>&1 &
sleep 2

CLAVE=$(node -e "
const c=require('crypto');const b=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const h=b({alg:'HS256',typ:'JWT'})+'.'+b({role:'service_role',iss:'local'});
console.log(h+'.'+c.createHmac('sha256','$SECRETO').update(h).digest('base64url'));")
cat > "$DIR/env.sh" <<ENV
export SUPABASE_PRUEBAS_REST_URL=http://127.0.0.1:$RESTPORT
export SUPABASE_PRUEBAS_CLAVE=$CLAVE
export SUPABASE_PRUEBAS_PG=postgres://postgres@127.0.0.1:$PGPORT/cmms
ENV
echo "Listo. PostgREST en http://127.0.0.1:$RESTPORT — variables en $DIR/env.sh"

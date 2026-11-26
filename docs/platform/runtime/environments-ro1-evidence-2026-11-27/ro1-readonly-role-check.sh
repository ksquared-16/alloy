#!/bin/bash
# RO1 (ALY-14 step 5): the read-only role script, environments-readonly-role-2026-11-27.sql, proven locally on the two
# cases it meets on the hosted projects.
#
#   A  the new project tjziptdknxdajzauctha: empty. The role script runs first, then the 558-migration chain as
#      `postgres` (the step-9 order: `emit-sql ledger-table`, then each file with its ledger row).
#   B  staging ikaxilmwmrmbagoidedu: the chain is already applied. The role script runs after it.
#
# Each is a throwaway Supabase Postgres (the image hosted projects run, 17.6.1.165) on tmpfs, with the GoTrue and
# Storage platform schemas, attached only to an --internal Docker network (no egress). Every script and query runs
# as `postgres`, the role the SQL Editor uses (not a superuser), or as `alloy_readonly`.
#
# For each case: every read the release tool and the step-6 export run against a READONLY URL, as `postgres` and as
# `alloy_readonly`, with the outputs compared; then the refusals (writes, read-only turned off then a write, DDL, a
# writing SECURITY DEFINER function); then what PUBLIC still reaches. No hosted service, no credential, no supabase CLI.
# Teardown removes every container and the network.
#
# Usage: ro1-readonly-role-check.sh <evidence-dir>   (about 5 minutes)
set -u
EV=$1; mkdir -p "$EV"; EV=$(cd "$EV" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
ROLE_SQL=$REPO/docs/platform/runtime/environments-readonly-role-2026-11-27.sql
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
PW=ro1-throwaway        # local-only password for the throwaway containers' roles; destroyed with them
JWT_SECRET=ro1-throwaway-jwt-secret-not-a-secret-0000000
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=ro1-readonly-role-throwaway)
NET=alloy-ro1-int
REL="node $REPO/scripts/release/alloy-release.mjs"
T=/tmp/alloy-ro1
ORG=93667019-bd28-49b5-a688-acc9bb1e0a19   # staging's Firefly org id, as the step-6 export names it; a local row here
rm -rf "$T" "$EV/case-a" "$EV/case-b" "$EV/queries"; mkdir -p "$T" "$EV/case-a" "$EV/case-b" "$EV/queries"

cleanup() {
  [ -n "${KEEP:-}" ] && { echo "KEEP set: containers left up"; return; }
  docker rm -f $(docker ps -aq --filter label=alloy.purpose=ro1-readonly-role-throwaway) >/dev/null 2>&1
  docker network rm $NET >/dev/null 2>&1
  rm -rf "$T"
  echo "teardown: containers=[$(docker ps -aq --filter label=alloy.purpose=ro1-readonly-role-throwaway | tr '\n' ' ')] networks=[$(docker network ls -q --filter label=alloy.purpose=ro1-readonly-role-throwaway | tr '\n' ' ')]"
}
trap cleanup EXIT
die() { echo "STOP: $*"; exit 2; }

AS_PG() { local C=$1; shift; docker exec -i -e PGOPTIONS="${PGOPT:-}" "$C" psql -U postgres -d postgres -X "$@"; }
# alloy_readonly signs in over TCP with a password, as it will through the pooler; nothing else is passed in, so
# the session's read-only default and timeouts are the role's own.
AS_RO() { local C=$1; shift; docker exec -i -e PGPASSWORD=$PW -e PGOPTIONS="${PGOPT:-}" "$C" psql -h 127.0.0.1 -U alloy_readonly -d postgres -X "$@"; }

# ── the reads: exactly what the release tool emits, and the export's own SQL ──
for k in ledger ledger-if-present fingerprint census orgs ledger-table; do $REL emit-sql $k > "$EV/queries/$k.sql" || die "emit-sql $k"; done
printf 'import { renderExportSql } from "%s/web/lib/tenancy/configTransfer/exportSql";\nprocess.stdout.write(renderExportSql());\n' "$REPO" > "$T/render-export.ts"
(cd "$REPO/web" && node_modules/.bin/tsx --tsconfig tsconfig.json "$T/render-export.ts") > "$EV/queries/tenant-config-export.sql" || die "render export sql"
[ -s "$EV/queries/tenant-config-export.sql" ] || die "export sql is empty"
shasum -a 256 "$EV"/queries/*.sql | sed "s|$EV/||" > "$EV/queries/SHA256SUMS"

boot() {  # <container>
  local C=$1
  docker run -d --name $C --network $NET --tmpfs /var/lib/postgresql/data:size=4g "${LBL[@]}" -e POSTGRES_PASSWORD=$PW $PG >/dev/null || die "boot $C"
  for i in $(seq 1 60); do
    docker logs $C 2>&1 | grep -q 'init process complete' && docker exec $C pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec $C psql -U supabase_admin -d postgres -qAt -c "alter role supabase_auth_admin password '$PW'" -c "alter role supabase_storage_admin password '$PW'" || die "roles $C"
  docker run --rm --network $NET "${LBL[@]}" --entrypoint auth -e GOTRUE_DB_DRIVER=postgres -e DB_NAMESPACE=auth \
    -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=$JWT_SECRET \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$T/$C-gotrue.log" 2>&1
  local g=$?
  docker run --rm --network $NET "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
    -e AUTH_JWT_SECRET=$JWT_SECRET -e ANON_KEY=x -e SERVICE_KEY=x \
    -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$T/$C-storage.log" 2>&1
  local s=$?
  [ $g -eq 0 ] && [ $s -eq 0 ] || die "$C platform schemas gotrue_rc=$g storage_rc=$s"
  echo "$C: $(AS_PG $C -AtX -c 'select version()' | cut -d, -f1); platform schemas: gotrue_rc=$g storage_rc=$s; networks=[$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')] internal=$(docker network inspect $NET --format '{{.Internal}}')"
}

chain() {  # <container> <log>: the step-9 order, as postgres
  local C=$1 LOG=$2 n=0
  AS_PG $C -v ON_ERROR_STOP=1 --single-transaction -q -f - < "$EV/queries/ledger-table.sql" || die "$C ledger-table"
  docker exec $C rm -rf /tmp/migrations; docker cp "$REPO/supabase/migrations" $C:/tmp/migrations >/dev/null
  : > "$LOG"
  for f in $(ls "$REPO/supabase/migrations" | sort); do
    v=${f%%_*}; nm=${f#*_}; nm=${nm%.sql}
    docker exec $C sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$nm'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" > /dev/null 2>"$T/apply-stderr.txt"
    rc=$?; echo "$rc $f" >> "$LOG"; [ $rc -ne 0 ] && { cat "$T/apply-stderr.txt"; die "$C chain stopped at $f"; }
    n=$((n+1))
  done
  echo "$C: chain applied as postgres: $n files, ledger $(AS_PG $C -AtX -c 'select count(*) from supabase_migrations.schema_migrations') rows, head $(AS_PG $C -AtX -c 'select max(version) from supabase_migrations.schema_migrations')"
}

role_script() {  # <container> <out>: what the owner pastes into the SQL Editor, run as postgres
  AS_PG $1 -v ON_ERROR_STOP=1 -f - < "$ROLE_SQL" > "$2" 2>&1 || { cat "$2"; die "$1 role script"; }
  # The throwaway's sign-in. On the hosted projects the owner sets the real password outside the SQL Editor (guide, step 5).
  AS_PG $1 -qAtX -c "alter role alloy_readonly password '$PW'" || die "$1 throwaway password"
  echo "$1: role script ran: $(grep -c '| ok' "$2") of 9 checks ok; WRONG rows: $(grep -c 'WRONG' "$2")"
}


seed() {  # <container>: a tenant's configuration rows, written as postgres (they sit behind RLS like every public row)
  AS_PG $1 -qAtX -v ON_ERROR_STOP=1 -c "insert into public.orgs (id, name, slug) values ('$ORG', 'Firefly (RO1 local row)', 'ro1-firefly') on conflict (id) do nothing" \
    -c "insert into public.locations (org_id, location_number, location_type, label) select '$ORG', 9001, 'site', 'RO1 site' where not exists (select 1 from public.locations where org_id = '$ORG' and location_number = 9001)" \
    || die "$1 seed"
  echo "$1: seeded org $ORG with one site (as postgres): orgs=$(AS_PG $1 -AtX -c 'select count(*) from public.orgs') locations=$(AS_PG $1 -AtX -c "select count(*) from public.locations where org_id = '$ORG'") role_types=$(AS_PG $1 -AtX -c "select count(*) from public.customer_person_role_types where org_id = '$ORG'")"
}

compare() {  # <container> <dir> <name> <sql> [psql flags...]: the same read as postgres and as alloy_readonly
  local C=$1 D=$2 N=$3 Q=$4; shift 4
  AS_PG $C "$@" -f - < "$Q" > "$D/$N.postgres.txt" 2>&1; local r1=$?
  AS_RO $C "$@" -f - < "$Q" > "$D/$N.alloy_readonly.txt" 2>&1; local r2=$?
  local v=DIFFERENT; cmp -s "$D/$N.postgres.txt" "$D/$N.alloy_readonly.txt" && v=EQUAL
  printf '  %-26s postgres rc=%s lines=%-4s | alloy_readonly rc=%s lines=%-4s | %s sha256 %s\n' "$N" $r1 "$(wc -l < "$D/$N.postgres.txt" | tr -d ' ')" $r2 "$(wc -l < "$D/$N.alloy_readonly.txt" | tr -d ' ')" $v "$(shasum -a 256 "$D/$N.alloy_readonly.txt" | cut -c1-12)"
  [ $v = EQUAL ] && [ $r1 -eq 0 ] && [ $r2 -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

reads() {  # <container> <dir>: every READONLY read the release tool and the step-6 export run
  compare $1 $2 ledger "$EV/queries/ledger.sql" -At
  compare $1 $2 ledger-if-present "$EV/queries/ledger-if-present.sql" -At -q
  compare $1 $2 fingerprint "$EV/queries/fingerprint.sql" -At
  compare $1 $2 census "$EV/queries/census.sql" -At
  compare $1 $2 orgs "$EV/queries/orgs.sql" -At
  PGOPT="-c default_transaction_read_only=on" compare $1 $2 tenant-config-export "$EV/queries/tenant-config-export.sql" -q -A -t -v org_id=$ORG
}

control() {  # <container> <dir>: the same orgs read and the export, as a role WITHOUT BYPASSRLS (why the role has it)
  AS_PG $1 -qAtX -v ON_ERROR_STOP=1 -c "create role ro1_control_nobypassrls login nobypassrls password '$PW'" \
    -c "alter role ro1_control_nobypassrls set default_transaction_read_only = on" \
    -c "grant usage on schema public to ro1_control_nobypassrls" -c "grant select on all tables in schema public to ro1_control_nobypassrls" || die "control role"
  local CR="docker exec -i -e PGPASSWORD=$PW $1 psql -h 127.0.0.1 -U ro1_control_nobypassrls -d postgres -X"
  $CR -At -f - < "$EV/queries/orgs.sql" > "$2/control-nobypassrls-orgs.txt" 2>&1
  $CR -q -A -t -v org_id=$ORG -f - < "$EV/queries/tenant-config-export.sql" > "$2/control-nobypassrls-export.txt" 2>&1
  echo "  control (same SELECT grants, NOBYPASSRLS): orgs lines=$(grep -c . "$2/control-nobypassrls-orgs.txt") (alloy_readonly $(grep -c . "$2/orgs.alloy_readonly.txt")); export org=$(grep -o '"org" : [^,]*' "$2/control-nobypassrls-export.txt" | head -1) locations=$(grep -o '"locations" : \[[^]]\{0,3\}' "$2/control-nobypassrls-export.txt" | head -1)"
  AS_PG $1 -qAtX -c "revoke select on all tables in schema public from ro1_control_nobypassrls" -c "revoke usage on schema public from ro1_control_nobypassrls" -c "drop role ro1_control_nobypassrls" || die "drop control role"
}

refuse() {  # <container> <file> <label> <sql> [off]: must fail, as alloy_readonly, one session each. With `off`, the
  # session first runs `SET default_transaction_read_only = off` as its own statement (its own transaction: inside one
  # `-c` string the SET would not reach the transaction already started, and the test would prove nothing).
  local pre=(); [ "${5:-}" = off ] && pre=(-c "set default_transaction_read_only = off")
  local out; out=$(AS_RO $1 -At -v ON_ERROR_STOP=1 ${pre[@]+"${pre[@]}"} -c "$4" 2>&1); local rc=$?
  local err; err=$(echo "$out" | grep -m1 -E 'ERROR|WARNING' | sed 's/^psql:[^:]*:[0-9]*: //')
  if [ $rc -ne 0 ]; then printf 'REFUSED  %-58s rc=%s  %s\n' "$3" $rc "$err" >> "$2"; PASS=$((PASS+1));
  else printf 'ALLOWED  %-58s rc=%s  %s\n' "$3" $rc "$(echo "$out" | tr '\n' ' ' | cut -c1-120)" >> "$2"; FAIL=$((FAIL+1)); fi
  printf '         sql: %s%s\n' "$([ "${5:-}" = off ] && echo 'set default_transaction_read_only = off; -- then, as its own statement: ')" "$4" >> "$2"
}

refusals() {  # <container> <dir>
  local C=$1 R=$2/refusals.txt; : > "$R"
  local BEFORE; BEFORE=$(AS_PG $C -At -f - < "$EV/queries/census.sql" | shasum -a 256 | cut -c1-16)
  local SEQ; SEQ=$(AS_PG $C -AtX -c "select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'S' and n.nspname = 'public' order by 1 limit 1")
  echo "## writes, in the role's default read-only session" >> "$R"
  refuse $C "$R" "insert public.orgs" "insert into public.orgs (name, slug) values ('ro1', 'ro1')"
  refuse $C "$R" "update public.orgs" "update public.orgs set name = name"
  refuse $C "$R" "delete public.locations" "delete from public.locations"
  refuse $C "$R" "truncate public.locations" "truncate public.locations"
  echo "## read-only turned off, then a write (refused by privilege, not by the setting)" >> "$R"
  refuse $C "$R" "SET read_only off; insert public.orgs" "insert into public.orgs (name, slug) values ('ro1', 'ro1')" off
  refuse $C "$R" "SET read_only off; update public.orgs" "update public.orgs set name = name" off
  refuse $C "$R" "SET read_only off; delete public.locations" "delete from public.locations" off
  refuse $C "$R" "SET read_only off; truncate public.locations" "truncate public.locations" off
  refuse $C "$R" "BEGIN READ WRITE; update public.orgs" "begin read write; update public.orgs set name = name; commit"
  refuse $C "$R" "SET read_only off; delete the ledger" "delete from supabase_migrations.schema_migrations" off
  refuse $C "$R" "SET read_only off; update storage.buckets" "update storage.buckets set public = true" off
  if [ -n "$SEQ" ]; then refuse $C "$R" "SET read_only off; nextval($SEQ)" "select nextval('$SEQ')" off
  else echo "SKIPPED  nextval: public has no sequence on this database" >> "$R"; fi
  echo "## DDL" >> "$R"
  refuse $C "$R" "create table public.ro1_x" "create table public.ro1_x (i int)"
  refuse $C "$R" "SET read_only off; create table public.ro1_x" "create table public.ro1_x (i int)" off
  refuse $C "$R" "SET read_only off; create schema ro1_x" "create schema ro1_x" off
  refuse $C "$R" "SET read_only off; alter table public.orgs add column" "alter table public.orgs add column ro1_x int" off
  refuse $C "$R" "SET read_only off; drop table public.locations" "drop table public.locations" off
  refuse $C "$R" "SET read_only off; create function public.ro1_f" "create function public.ro1_f() returns int language sql as 'select 1'" off
  refuse $C "$R" "SET read_only off; create index on public.orgs" "create index ro1_ix on public.orgs (name)" off
  echo "## the role cannot widen itself" >> "$R"
  refuse $C "$R" "alter role alloy_readonly reset read_only" "alter role alloy_readonly reset default_transaction_read_only"
  refuse $C "$R" "set role postgres" "set role postgres"
  echo "## writing SECURITY DEFINER functions (public; owner postgres)" >> "$R"
  refuse $C "$R" "consume_rate_limit (writes a counter)" "select public.consume_rate_limit('ro1', 1, 60)"
  refuse $C "$R" "SET read_only off; consume_rate_limit" "select public.consume_rate_limit('ro1', 1, 60)" off
  refuse $C "$R" "SET read_only off; document_configuration_seed" "select public.document_configuration_seed('$ORG')" off
  refuse $C "$R" "SET read_only off; certification_reset_execute" "select public.certification_reset_execute('$ORG', 'x', 'x', '{}'::jsonb)" off
  refuse $C "$R" "SET read_only off; orgs_seed_default_rbac (PUBLIC, trigger)" "select public.orgs_seed_default_rbac()" off
  echo "## what PUBLIC reaches, in the role's default read-only session" >> "$R"
  refuse $C "$R" "lo_create" "select lo_create(0)"
  refuse $C "$R" "net.http_get" "select net.http_get('http://127.0.0.1:9/ro1')"
  refuse $C "$R" "insert net.http_request_queue" "insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds) values ('GET', 'http://127.0.0.1:9/ro1', '{}', null, 1000)"
  refuse $C "$R" "create temp table" "create temp table ro1_t (i int)"
  local AFTER; AFTER=$(AS_PG $C -At -f - < "$EV/queries/census.sql" | shasum -a 256 | cut -c1-16)
  echo "## census as postgres before and after the refusals: $BEFORE $AFTER $([ "$BEFORE" = "$AFTER" ] && echo unchanged || echo CHANGED)" >> "$R"
  [ "$BEFORE" = "$AFTER" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  echo "  refusals: $(grep -c '^REFUSED' "$R") refused, $(grep -c '^ALLOWED' "$R") allowed; census $([ "$BEFORE" = "$AFTER" ] && echo unchanged || echo CHANGED)"
}

public_reach() {  # <container> <dir>: measured, not hidden: what a session that turns read-only off can still do
  local C=$1 P=$2/public-reach.txt OFF=(-c "set default_transaction_read_only = off")
  {
    echo "# alloy_readonly with read-only deliberately turned off: what PUBLIC (Supabase's grants to every role) still reaches"
    echo "## lo_create";       AS_RO $C -At "${OFF[@]}" -c "select 'large object ' || lo_create(0)" 2>&1
    echo "## net.http_get";    AS_RO $C -At "${OFF[@]}" -c "select 'queued request ' || net.http_get('http://127.0.0.1:9/ro1')" 2>&1
    echo "## insert net.http_request_queue"; AS_RO $C -At "${OFF[@]}" -c "insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds) values ('GET', 'http://127.0.0.1:9/ro1', '{}', null, 1000) returning 'row ' || id" 2>&1
    echo "## temp table";      AS_RO $C -At "${OFF[@]}" -c "create temp table ro1_t (i int)" -c "insert into ro1_t values (1)" -c "select 'temp rows ' || count(*) from ro1_t" 2>&1
    echo "## temp table after the session ends (as postgres)"; AS_PG $C -At -c "select 'ro1_t tables left: ' || count(*) from pg_class where relname = 'ro1_t'" 2>&1
    echo "## its own session defaults (Postgres lets every role change its own)"; AS_RO $C -At "${OFF[@]}" -c "alter role alloy_readonly set default_transaction_read_only = off" -c "select 'own default changed'" 2>&1
    echo "## the role script's check row 2, read as postgres"; sed -n '/^-- The check table\./,$p' "$ROLE_SQL" | AS_PG $C -At -f - 2>&1 | grep '^session settings'
    echo "## the role script run again restores it"; AS_PG $C -v ON_ERROR_STOP=1 -At -f - < "$ROLE_SQL" 2>&1 | grep '^session settings'
    echo "## public tables and data, as postgres"; AS_PG $C -At -c "select 'orgs ' || count(*) from public.orgs" -c "select 'public tables ' || count(*) from pg_tables where schemaname = 'public'" 2>&1
  } > "$P"
  echo "  public reach (read-only off): $(grep -c -E '^(large object|queued request|row|temp rows|own default changed)' "$P") of 5 paths succeeded; check row 2 then: $(grep '^session settings' "$P" | head -1 | cut -c1-60); after a re-run: $(grep '^session settings' "$P" | tail -1)"
}

PASS=0; FAIL=0
docker network create --internal "${LBL[@]}" $NET >/dev/null || die "network"

echo "## case A: the new project (empty; the role script first, then the chain)"
boot alloy-ro1-a
role_script alloy-ro1-a "$EV/case-a/role-script-on-empty.txt"
echo "  before the chain (step 7's reads of the new project):"
compare alloy-ro1-a "$EV/case-a" before-chain-ledger-if-present "$EV/queries/ledger-if-present.sql" -At -q
compare alloy-ro1-a "$EV/case-a" before-chain-fingerprint "$EV/queries/fingerprint.sql" -At
chain alloy-ro1-a "$EV/case-a/chain-apply.log"
# The script's check table only (its final SELECT), NOT the script: case A proves the default privileges alone cover
# every table the chain created.
sed -n '/^-- The check table\./,$p' "$ROLE_SQL" | AS_PG alloy-ro1-a -f - > "$EV/case-a/checks-after-chain.txt" 2>&1
echo "  checks after the chain (the role script's own table, re-read): $(grep -c '| ok' "$EV/case-a/checks-after-chain.txt") of 9 ok"
seed alloy-ro1-a
reads alloy-ro1-a "$EV/case-a"
control alloy-ro1-a "$EV/case-a"
refusals alloy-ro1-a "$EV/case-a"
public_reach alloy-ro1-a "$EV/case-a"

echo "## case B: staging (the chain already applied; the role script after it, then run a second time)"
boot alloy-ro1-b
chain alloy-ro1-b "$EV/case-b/chain-apply.log"
seed alloy-ro1-b
role_script alloy-ro1-b "$EV/case-b/role-script-on-applied.txt"
role_script alloy-ro1-b "$EV/case-b/role-script-second-run.txt"
reads alloy-ro1-b "$EV/case-b"
control alloy-ro1-b "$EV/case-b"
refusals alloy-ro1-b "$EV/case-b"
public_reach alloy-ro1-b "$EV/case-b"

echo "## result: $PASS passed, $FAIL failed"
[ $FAIL -eq 0 ]

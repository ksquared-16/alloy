#!/bin/bash
# RO1 (ALY-14 step 5): the read-only role script, environments-readonly-role-2026-11-27.sql, proven locally on the two
# cases it meets on the hosted projects.
#
#   A  the new project tjziptdknxdajzauctha: empty. The role script runs first, then the 558-migration chain as
#      `postgres` (the step-9 order: `emit-sql ledger-table`, then each file with its ledger row).
#   B  staging ikaxilmwmrmbagoidedu: the chain is already applied. The role script runs after it.
#
# Everything runs on the ONE shared local stack, `alloy-cert` (docs/platform/governance/local-docker-containment.md):
# the harness joins it with `alloy-stack use`, starts no container of its own, and releases its lease at the end. Each
# case is a throwaway database inside that stack (ro1_case_a_<pid>, ro1_case_b_<pid>), created by `postgres`, with the
# platform a hosted project's database has before any Alloy migration: platform/1-*.sql, then GoTrue's and Storage's
# own migrations run by the stack's own auth and storage containers against that database, then platform/2-*.sql and
# the pg_cron stand-in platform/3-*.sql. Nothing in the platform step is cluster-wide.
#
# Roles are cluster-wide, so the role script runs under a test name, ro1_readonly_<pid>: the harness substitutes it for
# `alloy_readonly` in a copy of the committed script, and proves the copy differs from the committed file only by that
# name. The committed script still creates `alloy_readonly`; nothing here creates that role.
#
# For each case: every read the release tool and the step-6 export run against a READONLY URL, as `postgres` and as the
# role. The catalog and ledger reads must be equal; the reads of tenant rows (census, orgs, export) must be refused by
# row-level security (the role has NOBYPASSRLS and row_security = off), and with row_security turned back on in its own
# session the role must read no tenant row. Then the refusals (writes, read-only turned off then a write, DDL, a writing
# SECURITY DEFINER function); then what PUBLIC still reaches. No hosted service, no credential, no supabase CLI.
# Teardown (also on failure): drop the test roles' grants and default privileges in each case database, drop the case
# databases and the test roles, show with \du and \ddp that none remains, release the lease.
#
# Usage: ro1-readonly-role-check.sh <evidence-dir>   (about 2 minutes on a running stack)
set -u
SECONDS=0
EV=$1; mkdir -p "$EV"; EV=$(cd "$EV" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
ROLE_SQL_SRC=$REPO/docs/platform/runtime/environments-readonly-role-2026-11-27.sql
PROJECT=alloy-cert
STACK=$(command -v alloy-stack || echo "$REPO/scripts/local-dev/alloy-stack")
HOLDER=ro1-readonly-check-$$
DBA=ro1_case_a_$$
DBB=ro1_case_b_$$
ROLE=ro1_readonly_$$                  # the role script's role, under its test name
PW=ro1-throwaway        # local-only password for the test role; loopback is `trust` on the stack, and the role is dropped
REL="node $REPO/scripts/release/alloy-release.mjs"
T=/tmp/alloy-ro1-$$
ORG=93667019-bd28-49b5-a688-acc9bb1e0a19   # staging's Firefly org id, as the step-6 export names it; a local row here
CRON_FILE=20261002120000_scheduled_work_clock_pg_cron.sql
CRON_LINE='create extension if not exists pg_cron;'
rm -rf "$EV/case-a" "$EV/case-b" "$EV/queries"; mkdir -p "$T" "$EV/case-a" "$EV/case-b" "$EV/queries"
LEASED=0; WAS_UP=0; C=

die() { echo "STOP: $*"; exit 2; }
SA() { local D=$1; shift; docker exec -i "$C" psql -U supabase_admin -d "$D" -X "$@"; }   # harness setup and teardown only
AS_PG() { local D=$1; shift; docker exec -i -e PGOPTIONS="${PGOPT:-}" "$C" psql -U postgres -d "$D" -X "$@"; }
# The role signs in over TCP, as it will through the pooler; nothing else is passed in, so the session's read-only
# default and timeouts are the role's own.
AS_RO() { local D=$1; shift; docker exec -i -e PGPASSWORD=$PW -e PGOPTIONS="${PGOPT:-}" "$C" psql -h 127.0.0.1 -U $ROLE -d "$D" -X "$@"; }
role_exists() { [ "$(SA postgres -AtX -c "select count(*) from pg_roles where rolname = '$1'")" = 1 ]; }
db_exists() { [ "$(SA postgres -AtX -c "select count(*) from pg_database where datname = '$1'")" = 1 ]; }
# Every role, its attributes and settings, and every membership: cluster-wide state, compared before and after.
roles_state() { SA postgres -AtX -c "select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls, rolconnlimit, rolconfig from pg_roles order by 1" \
  -c "select roleid::regrole, member::regrole, admin_option, inherit_option, set_option from pg_auth_members order by 1, 2" \
  -c "select setdatabase, setrole::regrole, setconfig from pg_db_role_setting order by 1, 2" | shasum -a 256 | cut -c1-16; }

drop_case() {  # <db>...: in each, the test roles' grants and default-privilege entries, then the database; then the test roles
  local D R
  for D in "$@"; do
    db_exists $D || continue
    role_exists $ROLE && SA $D -qAtX -c "drop owned by $ROLE" >/dev/null
    AS_PG postgres -qAtX -c "drop database $D with (force)" >/dev/null
  done
  role_exists $ROLE && SA postgres -qAtX -c "drop role $ROLE" >/dev/null
}

cleanup() {
  local rc=$?
  [ -n "${KEEP:-}" ] && { echo "KEEP set: databases $DBA $DBB and role $ROLE left in the shared stack; lease kept"; return; }
  if [ -n "$C" ]; then
    drop_case $DBA $DBB
    echo "## teardown proof (shared stack $C, database postgres)"
    echo "databases ro1_*: [$(SA postgres -AtX -c "select string_agg(datname, ' ') from pg_database where datname like 'ro1\_%'")]"
    echo '\du ro1*'; AS_PG postgres -c '\du ro1*'
    echo '\du alloy_readonly'; AS_PG postgres -c '\du alloy_readonly'
    echo '\ddp (default privileges: per database; the case databases are gone, so this is the shared database postgres)'
    AS_PG postgres -c '\ddp' > "$T/ddp.txt" 2>&1
    echo "  $(grep -c . "$T/ddp.txt") lines; lines naming ro1_ or alloy_readonly: $(grep -c -E 'ro1_|alloy_readonly' "$T/ddp.txt")"
    grep -E 'ro1_|alloy_readonly' "$T/ddp.txt"
    [ -n "${ROLES_BEFORE:-}" ] && { local after; after=$(roles_state); echo "cluster roles, memberships and role settings: before $ROLES_BEFORE after $after $([ "$ROLES_BEFORE" = "$after" ] && echo unchanged || echo CHANGED)"; }
  fi
  rm -rf "$T"
  if [ $LEASED = 1 ]; then
    # A stack that was already up when the harness joined is not the harness's to stop, whatever the lease count says.
    if [ $WAS_UP = 1 ]; then "$STACK" release --holder $HOLDER --keep-running 2>&1 | sed 's/^/  /'
    else "$STACK" release --holder $HOLDER 2>&1 | sed 's/^/  /'; fi
  fi
  echo "teardown done after ${SECONDS}s; exit $rc"
}
trap cleanup EXIT

# ── the shared stack: join it, find its containers, check its Postgres major against the hosted projects' (17) ──
[ -n "$(docker ps -q --filter label=com.supabase.cli.project=$PROJECT --filter name=supabase_db_)" ] && WAS_UP=1
echo "## shared stack $PROJECT ($([ $WAS_UP = 1 ] && echo 'already running' || echo 'down; alloy-stack use starts it'))"
ALLOY_STACK_HOLDER_PID=$$ "$STACK" use --holder $HOLDER 2>&1 | sed 's/^/  /'
[ "${PIPESTATUS[0]}" -eq 0 ] || die "alloy-stack use"
LEASED=1
ct() { docker ps --filter label=com.supabase.cli.project=$PROJECT --format '{{.Names}}' | grep "^supabase_$1_"; }
C=$(ct db); AUTHC=$(ct auth); STORC=$(ct storage)
[ -n "$C" ] && [ -n "$AUTHC" ] && [ -n "$STORC" ] || die "shared stack containers db=[$C] auth=[$AUTHC] storage=[$STORC]"
MAJOR=$(( $(SA postgres -AtX -c 'show server_version_num') / 10000 ))
echo "$C: $(docker inspect $C --format '{{.Config.Image}}'); $(SA postgres -AtX -c 'select version()' | cut -d, -f1); major $MAJOR, hosted projects 17: $([ $MAJOR = 17 ] && echo match || echo 'MISMATCH (the results below are from Postgres '$MAJOR', not 17)')"
echo "  auth $AUTHC ($(docker inspect $AUTHC --format '{{.Config.Image}}')), storage $STORC ($(docker inspect $STORC --format '{{.Config.Image}}'))"
for R in $ROLE alloy_readonly; do role_exists $R && die "role $R already exists on the shared stack"; done
for D in $DBA $DBB; do db_exists $D && die "database $D already exists on the shared stack"; done
ROLES_BEFORE=$(roles_state)
echo "  before: no role $ROLE or alloy_readonly; no database $DBA or $DBB; cluster roles $ROLES_BEFORE"

# ── the role script, under the test name: the committed file, with only the role's name replaced ──
ROLE_SQL=$T/role-script.sql
sed "s/alloy_readonly/$ROLE/g" "$ROLE_SQL_SRC" > "$ROLE_SQL"
grep -q "$ROLE" "$ROLE_SQL_SRC" && die "the committed script already contains $ROLE"
grep -q alloy_readonly "$ROLE_SQL" && die "substitution left alloy_readonly in the copy"
sed "s/$ROLE/alloy_readonly/g" "$ROLE_SQL" | cmp -s - "$ROLE_SQL_SRC" || die "the copy differs from the committed script by more than the role name"
echo "role script: committed $(basename "$ROLE_SQL_SRC") sha256 $(shasum -a 256 "$ROLE_SQL_SRC" | cut -c1-16); run as $ROLE: $(grep -o alloy_readonly "$ROLE_SQL_SRC" | wc -l | tr -d ' ') occurrences of alloy_readonly replaced; reversing the substitution gives the committed file byte for byte"

# ── the reads: exactly what the release tool emits, and the export's own SQL ──
for k in ledger ledger-if-present fingerprint census orgs ledger-table; do $REL emit-sql $k > "$EV/queries/$k.sql" || die "emit-sql $k"; done
printf 'import { renderExportSql } from "%s/web/lib/tenancy/configTransfer/exportSql";\nprocess.stdout.write(renderExportSql());\n' "$REPO" > "$T/render-export.ts"
(cd "$REPO/web" && node_modules/.bin/tsx --tsconfig tsconfig.json "$T/render-export.ts") > "$EV/queries/tenant-config-export.sql" || die "render export sql"
[ -s "$EV/queries/tenant-config-export.sql" ] || die "export sql is empty"
shasum -a 256 "$EV"/queries/*.sql | sed "s|$EV/||" > "$EV/queries/SHA256SUMS"
[ "$(grep -lx "$CRON_LINE" "$REPO"/supabase/migrations/*.sql | xargs -n1 basename)" = "$CRON_FILE" ] || die "pg_cron line is not exactly in $CRON_FILE"

case_db() {  # <db>: a throwaway database in the shared stack, with a hosted project's platform schemas
  local D=$1
  AS_PG postgres -qAtX -v ON_ERROR_STOP=1 -c "create database $D" || die "create database $D"
  SA $D -q -v ON_ERROR_STOP=1 -f - < "$HERE/platform/1-before-gotrue-storage.sql" > "$T/$D-platform-1.log" 2>&1 || { cat "$T/$D-platform-1.log"; die "$D platform 1"; }
  # The stack's own auth and storage containers run their migrations against this database: the connection URL each
  # already holds, with only its database name replaced (refused unless it ends in /postgres). No password is read.
  docker exec $AUTHC sh -c "case \"\$GOTRUE_DB_DATABASE_URL\" in */postgres) ;; *) exit 97 ;; esac; GOTRUE_DB_DATABASE_URL=\"\${GOTRUE_DB_DATABASE_URL%/postgres}/$D\" auth migrate" > "$T/$D-gotrue.log" 2>&1
  local g=$?
  docker exec $STORC sh -c "case \"\$DATABASE_URL\" in */postgres) ;; *) exit 97 ;; esac; DATABASE_URL=\"\${DATABASE_URL%/postgres}/$D\" node dist/scripts/migrate-call.js" > "$T/$D-storage.log" 2>&1
  local s=$?
  [ $g -eq 0 ] && [ $s -eq 0 ] || { tail -5 "$T/$D-gotrue.log" "$T/$D-storage.log"; die "$D platform schemas gotrue_rc=$g storage_rc=$s"; }
  SA $D -q -v ON_ERROR_STOP=1 -f - < "$HERE/platform/2-after-gotrue-storage.sql" > "$T/$D-platform-2.log" 2>&1 || { cat "$T/$D-platform-2.log"; die "$D platform 2"; }
  SA $D -q -v ON_ERROR_STOP=1 -f - < "$HERE/platform/3-pg_cron-stand-in.sql" > "$T/$D-platform-3.log" 2>&1 || { cat "$T/$D-platform-3.log"; die "$D pg_cron stand-in"; }
  echo "$D: created by postgres in $C (owner $(SA postgres -AtX -c "select datdba::regrole from pg_database where datname = '$D'")); platform schemas: gotrue_rc=$g ($(SA $D -AtX -c 'select count(*) from auth.schema_migrations') auth migrations) storage_rc=$s ($(SA $D -AtX -c 'select count(*) from storage.migrations') storage migrations); pg_cron stand-in"
}

chain() {  # <db> <log>: the step-9 order, as postgres. The files are piped in from the worktree; nothing is copied into the stack.
  local D=$1 LOG=$2 n=0
  AS_PG $D -v ON_ERROR_STOP=1 --single-transaction -q -f - < "$EV/queries/ledger-table.sql" || die "$D ledger-table"
  : > "$LOG"
  for f in $(ls "$REPO/supabase/migrations" | sort); do
    v=${f%%_*}; nm=${f#*_}; nm=${nm%.sql}
    { if [ "$f" = "$CRON_FILE" ]; then sed "s/^$CRON_LINE\$/select 1 where false; -- RO1: pg_cron stand-in (platform\/3-pg_cron-stand-in.sql)/" "$REPO/supabase/migrations/$f"
      else cat "$REPO/supabase/migrations/$f"; fi
      printf "\n;insert into supabase_migrations.schema_migrations(version,name) values ('%s','%s');\n" "$v" "$nm"
    } | AS_PG $D -q -v ON_ERROR_STOP=1 --single-transaction > /dev/null 2>"$T/apply-stderr.txt"
    rc=$?; echo "$rc $f" >> "$LOG"; [ $rc -ne 0 ] && { cat "$T/apply-stderr.txt"; die "$D chain stopped at $f"; }
    n=$((n+1))
  done
  echo "$D: chain applied as postgres: $n files ($CRON_FILE with its pg_cron line as a no-op), ledger $(AS_PG $D -AtX -c 'select count(*) from supabase_migrations.schema_migrations') rows, head $(AS_PG $D -AtX -c 'select max(version) from supabase_migrations.schema_migrations')"
}

role_script() {  # <db> <out>: what the owner pastes into the SQL Editor, run as postgres
  AS_PG $1 -v ON_ERROR_STOP=1 -f - < "$ROLE_SQL" > "$2" 2>&1 || { cat "$2"; die "$1 role script"; }
  # The test role's sign-in. On the hosted projects the owner sets the real password outside the SQL Editor (guide, step 5).
  AS_PG $1 -qAtX -c "alter role $ROLE password '$PW'" || die "$1 throwaway password"
  echo "$1: role script ran: $(grep -c '| ok' "$2") of 9 checks ok; WRONG rows: $(grep -c 'WRONG' "$2")"
}

seed() {  # <db>: a tenant's configuration rows, written as postgres (they sit behind RLS like every public row)
  AS_PG $1 -qAtX -v ON_ERROR_STOP=1 -c "insert into public.orgs (id, name, slug) values ('$ORG', 'Firefly (RO1 local row)', 'ro1-firefly') on conflict (id) do nothing" \
    -c "insert into public.locations (org_id, location_number, location_type, label) select '$ORG', 9001, 'site', 'RO1 site' where not exists (select 1 from public.locations where org_id = '$ORG' and location_number = 9001)" \
    || die "$1 seed"
  echo "$1: seeded org $ORG with one site (as postgres): orgs=$(AS_PG $1 -AtX -c 'select count(*) from public.orgs') locations=$(AS_PG $1 -AtX -c "select count(*) from public.locations where org_id = '$ORG'") role_types=$(AS_PG $1 -AtX -c "select count(*) from public.customer_person_role_types where org_id = '$ORG'")"
}

compare() {  # <db> <dir> <name> <sql> [psql flags...]: the same read as postgres and as the role
  local D=$1 O=$2 N=$3 Q=$4; shift 4
  AS_PG $D "$@" -f - < "$Q" > "$O/$N.postgres.txt" 2>&1; local r1=$?
  AS_RO $D "$@" -f - < "$Q" > "$O/$N.alloy_readonly.txt" 2>&1; local r2=$?
  local v=DIFFERENT; cmp -s "$O/$N.postgres.txt" "$O/$N.alloy_readonly.txt" && v=EQUAL
  printf '  %-26s postgres rc=%s lines=%-4s | alloy_readonly rc=%s lines=%-4s | %s sha256 %s\n' "$N" $r1 "$(wc -l < "$O/$N.postgres.txt" | tr -d ' ')" $r2 "$(wc -l < "$O/$N.alloy_readonly.txt" | tr -d ' ')" $v "$(shasum -a 256 "$O/$N.alloy_readonly.txt" | cut -c1-12)"
  [ $v = EQUAL ] && [ $r1 -eq 0 ] && [ $r2 -eq 0 ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

RLS_ERR='query would be affected by row-level security policy'
gated() {  # <db> <dir> <name> <sql> [psql flags...]: a read of tenant rows. postgres reads them; the role is refused by RLS
  local D=$1 O=$2 N=$3 Q=$4; shift 4
  AS_PG $D "$@" -f - < "$Q" > "$O/$N.postgres.txt" 2>&1; local r1=$?
  AS_RO $D -v ON_ERROR_STOP=1 "$@" -f - < "$Q" > "$O/$N.alloy_readonly.txt" 2>&1; local r2=$?
  local v=READ; grep -q "$RLS_ERR" "$O/$N.alloy_readonly.txt" && v=REFUSED_BY_RLS
  printf '  %-26s postgres rc=%s lines=%-4s | alloy_readonly rc=%s lines=%-4s | %s: %s\n' "$N" $r1 "$(wc -l < "$O/$N.postgres.txt" | tr -d ' ')" $r2 "$(wc -l < "$O/$N.alloy_readonly.txt" | tr -d ' ')" $v "$(grep -m1 -o "$RLS_ERR.*" "$O/$N.alloy_readonly.txt")"
  [ $v = REFUSED_BY_RLS ] && [ $r1 -eq 0 ] && [ $r2 -ne 0 ] && [ -s "$O/$N.postgres.txt" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

reads() {  # <db> <dir>: every READONLY read the release tool and the step-6 export run
  compare $1 $2 ledger "$EV/queries/ledger.sql" -At
  compare $1 $2 ledger-if-present "$EV/queries/ledger-if-present.sql" -At -q
  compare $1 $2 fingerprint "$EV/queries/fingerprint.sql" -At
  gated $1 $2 census "$EV/queries/census.sql" -At
  gated $1 $2 orgs "$EV/queries/orgs.sql" -At
  PGOPT="-c default_transaction_read_only=on" gated $1 $2 tenant-config-export "$EV/queries/tenant-config-export.sql" -q -A -t -v org_id=$ORG
}

rows_hidden() {  # <db> <dir>: the role turns row_security back on in its own session: RLS then hides every tenant row
  local D=$1 H=$2/rows-hidden.txt ON=(-c "set row_security = on")
  {
    echo "# $ROLE (the role script's role, test name) with row_security = on in its own session; postgres reads orgs=$(AS_PG $D -AtX -c 'select count(*) from public.orgs')"
    echo "## rolbypassrls"; AS_PG $D -AtX -c "select rolbypassrls from pg_roles where rolname = '$ROLE'" 2>&1
    echo "## policies naming the role"; AS_PG $D -AtX -c "select count(*) from pg_policies where '$ROLE' = any(roles)" 2>&1
    echo "## orgs"; AS_RO $D -q -At "${ON[@]}" -f - < "$EV/queries/orgs.sql" 2>&1
    echo "## count(*) public.orgs, public.locations"; AS_RO $D -q -At "${ON[@]}" -c "select 'orgs ' || count(*) from public.orgs" -c "select 'locations ' || count(*) from public.locations" 2>&1
    echo "## export"; PGOPT="-c default_transaction_read_only=on" AS_RO $D -q -A -t "${ON[@]}" -v org_id=$ORG -f - < "$EV/queries/tenant-config-export.sql" 2>&1
  } > "$H"
  local bypass pol orgs locs; bypass=$(sed -n '/^## rolbypassrls/{n;p;}' "$H"); pol=$(sed -n '/^## policies naming/{n;p;}' "$H")
  orgs=$(sed -n '/^## orgs$/,/^## count/p' "$H" | grep -vc '^##'); locs=$(grep -o '^locations [0-9]*' "$H")
  echo "  rows hidden (row_security on, own session): rolbypassrls=$bypass, policies naming the role=$pol; orgs lines=$orgs; $(grep -o '^orgs [0-9]*' "$H"), $locs; export org=$(grep -o '"org" : [^,]*' "$H" | head -1)"
  [ "$bypass" = f ] && [ "$pol" = 0 ] && [ "$orgs" = 0 ] && grep -qx 'orgs 0' "$H" && [ "$locs" = 'locations 0' ] && grep -q '"org" : null' "$H" && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
}

refuse() {  # <db> <file> <label> <sql> [off|off-rls]: must fail, as the role, one session each. With `off`, the session
  # first runs `SET default_transaction_read_only = off` as its own statement (its own transaction: inside one `-c`
  # string the SET would not reach the transaction already started, and the test would prove nothing). With `off-rls`
  # it also turns row_security back on, so a write on a table behind RLS meets the privilege check, not the RLS error.
  local pre=(); [ "${5:-}" = off ] && pre=(-c "set default_transaction_read_only = off")
  [ "${5:-}" = off-rls ] && pre=(-c "set default_transaction_read_only = off" -c "set row_security = on")
  local out; out=$(AS_RO $1 -At -v ON_ERROR_STOP=1 ${pre[@]+"${pre[@]}"} -c "$4" 2>&1); local rc=$?
  local err; err=$(echo "$out" | grep -m1 -E 'ERROR|WARNING' | sed 's/^psql:[^:]*:[0-9]*: //')
  if [ $rc -ne 0 ]; then printf 'REFUSED  %-58s rc=%s  %s\n' "$3" $rc "$err" >> "$2"; PASS=$((PASS+1));
  else printf 'ALLOWED  %-58s rc=%s  %s\n' "$3" $rc "$(echo "$out" | tr '\n' ' ' | cut -c1-120)" >> "$2"; FAIL=$((FAIL+1)); fi
  local how=; [ "${5:-}" = off ] && how='set default_transaction_read_only = off; -- then, as its own statement: '
  [ "${5:-}" = off-rls ] && how='set default_transaction_read_only = off; set row_security = on; -- each its own statement, then: '
  printf '         sql: %s%s\n' "$how" "$4" >> "$2"
}

refusals() {  # <db> <dir>
  local D=$1 R=$2/refusals.txt; : > "$R"
  echo "# as $ROLE, the role script's role under its test name" >> "$R"
  local BEFORE; BEFORE=$(AS_PG $D -At -f - < "$EV/queries/census.sql" | shasum -a 256 | cut -c1-16)
  local SEQ; SEQ=$(AS_PG $D -AtX -c "select c.oid::regclass::text from pg_class c join pg_namespace n on n.oid = c.relnamespace where c.relkind = 'S' and n.nspname = 'public' order by 1 limit 1")
  echo "## writes, in the role's default read-only session" >> "$R"
  refuse $D "$R" "insert public.orgs" "insert into public.orgs (name, slug) values ('ro1', 'ro1')"
  refuse $D "$R" "update public.orgs" "update public.orgs set name = name"
  refuse $D "$R" "delete public.locations" "delete from public.locations"
  refuse $D "$R" "truncate public.locations" "truncate public.locations"
  echo "## read-only turned off, then a write (refused by privilege, not by the setting)" >> "$R"
  refuse $D "$R" "SET read_only off; insert public.orgs" "insert into public.orgs (name, slug) values ('ro1', 'ro1')" off
  refuse $D "$R" "SET read_only off; update public.orgs" "update public.orgs set name = name" off
  refuse $D "$R" "SET read_only off; delete public.locations" "delete from public.locations" off
  refuse $D "$R" "SET read_only off; truncate public.locations" "truncate public.locations" off
  echo "## read-only off AND row_security back on, then a write (the privilege check, with RLS out of the way)" >> "$R"
  refuse $D "$R" "read_only off, row_security on; insert public.orgs" "insert into public.orgs (name, slug) values ('ro1', 'ro1')" off-rls
  refuse $D "$R" "read_only off, row_security on; update public.orgs" "update public.orgs set name = name" off-rls
  refuse $D "$R" "read_only off, row_security on; delete public.locations" "delete from public.locations" off-rls
  refuse $D "$R" "read_only off, row_security on; update storage.buckets" "update storage.buckets set public = true" off-rls
  refuse $D "$R" "BEGIN READ WRITE; update public.orgs" "begin read write; update public.orgs set name = name; commit"
  refuse $D "$R" "SET read_only off; delete the ledger" "delete from supabase_migrations.schema_migrations" off
  refuse $D "$R" "SET read_only off; update storage.buckets" "update storage.buckets set public = true" off
  if [ -n "$SEQ" ]; then refuse $D "$R" "SET read_only off; nextval($SEQ)" "select nextval('$SEQ')" off
  else echo "SKIPPED  nextval: public has no sequence on this database" >> "$R"; fi
  echo "## DDL" >> "$R"
  refuse $D "$R" "create table public.ro1_x" "create table public.ro1_x (i int)"
  refuse $D "$R" "SET read_only off; create table public.ro1_x" "create table public.ro1_x (i int)" off
  refuse $D "$R" "SET read_only off; create schema ro1_x" "create schema ro1_x" off
  refuse $D "$R" "SET read_only off; alter table public.orgs add column" "alter table public.orgs add column ro1_x int" off
  refuse $D "$R" "SET read_only off; drop table public.locations" "drop table public.locations" off
  refuse $D "$R" "SET read_only off; create function public.ro1_f" "create function public.ro1_f() returns int language sql as 'select 1'" off
  refuse $D "$R" "SET read_only off; create index on public.orgs" "create index ro1_ix on public.orgs (name)" off
  echo "## the owner's step-5 check (owner guide, step 5, item 4), exactly" >> "$R"
  refuse $D "$R" "owner check 1: create table supabase_migrations.ro_check" "create table supabase_migrations.ro_check (i int)"
  refuse $D "$R" "owner check 2: SET read_only off; the same" "create table supabase_migrations.ro_check (i int)" off
  echo "## the role cannot widen itself" >> "$R"
  refuse $D "$R" "alter role (self) reset read_only" "alter role $ROLE reset default_transaction_read_only"
  refuse $D "$R" "set role postgres" "set role postgres"
  echo "## writing SECURITY DEFINER functions (public; owner postgres)" >> "$R"
  refuse $D "$R" "consume_rate_limit (writes a counter)" "select public.consume_rate_limit('ro1', 1, 60)"
  refuse $D "$R" "SET read_only off; consume_rate_limit" "select public.consume_rate_limit('ro1', 1, 60)" off
  refuse $D "$R" "SET read_only off; document_configuration_seed" "select public.document_configuration_seed('$ORG')" off
  refuse $D "$R" "SET read_only off; certification_reset_execute" "select public.certification_reset_execute('$ORG', 'x', 'x', '{}'::jsonb)" off
  refuse $D "$R" "SET read_only off; orgs_seed_default_rbac (PUBLIC, trigger)" "select public.orgs_seed_default_rbac()" off
  echo "## what PUBLIC reaches, in the role's default read-only session" >> "$R"
  refuse $D "$R" "lo_create" "select lo_create(0)"
  refuse $D "$R" "net.http_get" "select net.http_get('http://127.0.0.1:9/ro1')"
  refuse $D "$R" "insert net.http_request_queue" "insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds) values ('GET', 'http://127.0.0.1:9/ro1', '{}', null, 1000)"
  refuse $D "$R" "create temp table" "create temp table ro1_t (i int)"
  local AFTER; AFTER=$(AS_PG $D -At -f - < "$EV/queries/census.sql" | shasum -a 256 | cut -c1-16)
  echo "## census as postgres before and after the refusals: $BEFORE $AFTER $([ "$BEFORE" = "$AFTER" ] && echo unchanged || echo CHANGED)" >> "$R"
  [ "$BEFORE" = "$AFTER" ] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  echo "  refusals: $(grep -c '^REFUSED' "$R") refused, $(grep -c '^ALLOWED' "$R") allowed; census $([ "$BEFORE" = "$AFTER" ] && echo unchanged || echo CHANGED)"
}

public_reach() {  # <db> <dir>: measured, not hidden: what a session that turns read-only off can still do
  local D=$1 P=$2/public-reach.txt OFF=(-c "set default_transaction_read_only = off")
  {
    echo "# $ROLE (the role script's role, test name) with read-only deliberately turned off: what PUBLIC (Supabase's grants to every role) still reaches"
    echo "## lo_create";       AS_RO $D -At "${OFF[@]}" -c "select 'large object ' || lo_create(0)" 2>&1
    echo "## net.http_get";    AS_RO $D -At "${OFF[@]}" -c "select 'queued request ' || net.http_get('http://127.0.0.1:9/ro1')" 2>&1
    echo "## insert net.http_request_queue"; AS_RO $D -At "${OFF[@]}" -c "insert into net.http_request_queue (method, url, headers, body, timeout_milliseconds) values ('GET', 'http://127.0.0.1:9/ro1', '{}', null, 1000) returning 'row ' || id" 2>&1
    echo "## the queued requests, as postgres (pg_net's worker serves only the database postgres, so none is sent from here)"; AS_PG $D -At -c "select 'still queued: ' || count(*) from net.http_request_queue" 2>&1
    echo "## temp table";      AS_RO $D -At "${OFF[@]}" -c "create temp table ro1_t (i int)" -c "insert into ro1_t values (1)" -c "select 'temp rows ' || count(*) from ro1_t" 2>&1
    echo "## temp table after the session ends (as postgres)"; AS_PG $D -At -c "select 'ro1_t tables left: ' || count(*) from pg_class where relname = 'ro1_t'" 2>&1
    echo "## its own session defaults (Postgres lets every role change its own)"; AS_RO $D -At "${OFF[@]}" -c "alter role $ROLE set default_transaction_read_only = off" -c "select 'own default changed'" 2>&1
    echo "## the role script's check row 2, read as postgres"; sed -n '/^-- The check table\./,$p' "$ROLE_SQL" | AS_PG $D -At -f - 2>&1 | grep '^session settings'
    echo "## the role script run again restores it"; AS_PG $D -v ON_ERROR_STOP=1 -At -f - < "$ROLE_SQL" 2>&1 | grep '^session settings'
    echo "## public tables and data, as postgres"; AS_PG $D -At -c "select 'orgs ' || count(*) from public.orgs" -c "select 'public tables ' || count(*) from pg_tables where schemaname = 'public'" 2>&1
  } > "$P"
  echo "  public reach (read-only off): $(grep -c -E '^(large object|queued request|row|temp rows|own default changed)' "$P") of 5 paths succeeded; $(grep '^still queued' "$P"); check row 2 then: $(grep '^session settings' "$P" | head -1 | cut -c1-60); after a re-run: $(grep '^session settings' "$P" | tail -1)"
}

PASS=0; FAIL=0

echo "## case A: the new project (empty; the role script first, then the chain)"
case_db $DBA
role_script $DBA "$EV/case-a/role-script-on-empty.txt"
echo "  before the chain (step 7's reads of the new project):"
compare $DBA "$EV/case-a" before-chain-ledger-if-present "$EV/queries/ledger-if-present.sql" -At -q
compare $DBA "$EV/case-a" before-chain-fingerprint "$EV/queries/fingerprint.sql" -At
chain $DBA "$EV/case-a/chain-apply.log"
# The script's check table only (its final SELECT), NOT the script: case A proves the default privileges alone cover
# every table the chain created.
sed -n '/^-- The check table\./,$p' "$ROLE_SQL" | AS_PG $DBA -f - > "$EV/case-a/checks-after-chain.txt" 2>&1
echo "  checks after the chain (the role script's own table, re-read): $(grep -c '| ok' "$EV/case-a/checks-after-chain.txt") of 9 ok"
seed $DBA
reads $DBA "$EV/case-a"
rows_hidden $DBA "$EV/case-a"
refusals $DBA "$EV/case-a"
public_reach $DBA "$EV/case-a"
# Case B starts as staging does: no such role yet. Case A's database and role go first.
drop_case $DBA
echo "  case A dropped: database $DBA $(db_exists $DBA && echo LEFT || echo gone), role $ROLE $(role_exists $ROLE && echo LEFT || echo gone)"

echo "## case B: staging (the chain already applied; the role script after it, then run a second time)"
case_db $DBB
chain $DBB "$EV/case-b/chain-apply.log"
seed $DBB
role_script $DBB "$EV/case-b/role-script-on-applied.txt"
role_script $DBB "$EV/case-b/role-script-second-run.txt"
reads $DBB "$EV/case-b"
rows_hidden $DBB "$EV/case-b"
refusals $DBB "$EV/case-b"
public_reach $DBB "$EV/case-b"

echo "## result: $PASS passed, $FAIL failed (checks took ${SECONDS}s)"
[ $FAIL -eq 0 ]

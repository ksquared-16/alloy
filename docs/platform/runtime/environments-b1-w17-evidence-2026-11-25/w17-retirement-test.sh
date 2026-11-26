#!/bin/bash
# B1 (M2): the W-17 retirement migration over the full chain, on throwaway Supabase Postgres.
# Same isolation as P4's rehearse.sh: local images only, tmpfs data, no host ports, no mounts, and the only
# network ever attached is an --internal one for the GoTrue and Storage migrators, removed before any
# migration runs. Not the shared alloy-cert stack; no supabase CLI.
#
#   Run A (fresh): every file of the step-1 merge tree, in version order, from nothing.
#   Run B (staged): the chain up to origin/staging's head, which leaves an ACTIVE W-17 org (staging's
#     state today); census; then the new migration; census; then the new migration again (no-op); then
#     a rolled-back trial on a database with no W-17 org (no-op).
#
# Usage: w17-retirement-test.sh <tree-ish> <evidence-dir>
set -u
TREE=$1; EV=$2
NEW=20261223090000_w17_selftest_org_retirement.sql
C=alloy-b1-w17-test; N=alloy-b1-w17-internal
PW=b1-throwaway   # local-only role password inside a network-less container that is destroyed afterwards
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=b1-w17-throwaway)
SRC=/tmp/alloy-b1-w17/src
mkdir -p "$EV"; rm -rf /tmp/alloy-b1-w17; mkdir -p /tmp/alloy-b1-w17
git archive "$TREE" supabase/migrations | tar -x -C /tmp/alloy-b1-w17 && mv /tmp/alloy-b1-w17/supabase/migrations $SRC || exit 1
echo "tree=$TREE files=$(ls $SRC | wc -l | tr -d ' ') head=$(ls $SRC | sort | tail -1)"

psqlc() { docker exec -i $C psql -U postgres -d postgres -X -v ON_ERROR_STOP=1 "$@"; }

start() {
  docker network create --internal "${LBL[@]}" $N >/dev/null || exit 1
  docker run -d --name $C --network $N --rm --tmpfs /var/lib/postgresql/data:size=4g "${LBL[@]}" \
    -e POSTGRES_PASSWORD=$PW $PG >/dev/null || exit 1
  for i in $(seq 1 60); do
    docker logs $C 2>&1 | grep -q 'init process complete' && docker exec $C pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec $C psql -U supabase_admin -d postgres -qAt \
    -c "alter role supabase_auth_admin password '$PW'" -c "alter role supabase_storage_admin password '$PW'" || exit 1
  docker run --rm --network $N "${LBL[@]}" --entrypoint auth -e GOTRUE_DB_DRIVER=postgres -e DB_NAMESPACE=auth \
    -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=b1-throwaway-not-a-secret-000000000000 \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$EV/$1-gotrue-migrate.log" 2>&1
  echo "$1 gotrue_migrate_rc=$?"
  docker run --rm --network $N "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
    -e AUTH_JWT_SECRET=b1-throwaway-not-a-secret-000000000000 -e ANON_KEY=x -e SERVICE_KEY=x \
    -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$EV/$1-storage-migrate.log" 2>&1
  echo "$1 storage_migrate_rc=$?"
  docker network disconnect $N $C && docker network rm $N >/dev/null
  echo "$1 networks_attached=[$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')]"
  docker cp "$SRC" $C:/tmp/migrations >/dev/null
  psqlc -q -c "create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" || exit 1
}

stop() {
  docker stop $C >/dev/null
  echo "$1 teardown: containers=[$(docker ps -aq --filter label=alloy.purpose=b1-w17-throwaway | tr '\n' ' ')] networks=[$(docker network ls -q --filter label=alloy.purpose=b1-w17-throwaway | tr '\n' ' ')]"
}

# Apply one file as P4 step 4 and briefing §4 item 4 do: one transaction, ledger row inside it.
apply() {
  local f=$1 log=$2 v n out rc
  v=${f%%_*}; n=${f#*_}; n=${n%.sql}
  out=$(docker exec $C sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$n'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" 2>&1); rc=$?
  echo "$rc $f" >> "$log"
  [ "$f" = "$NEW" ] && echo "$out" | grep -E 'NOTICE|ERROR' >> "$log"
  if [ $rc -ne 0 ]; then echo "$out" | grep -v NOTICE | tail -20 >> "$log"; echo "STOPPED at $f"; return 2; fi
}

# The W-17 org(s), every org-scoped row they own, and the release tool's own org listing.
census() {
  local tag=$1
  {
    echo "## $tag: orgs whose slug starts with _w17_selftest_"
    psqlc -At -c "select id||' | name='||name||' | slug='||slug||' | status='||status from public.orgs where slug like '\_w17\_selftest\_%' escape '\' order by id;"
    echo "## $tag: all orgs"
    psqlc -At -c "select count(*) from public.orgs;"
    echo "## $tag: rows owned by the W-17 org(s), per org-scoped public table (non-zero only)"
    psqlc -At -c "do \$\$ declare r record; k bigint; begin
      create temp table w17rc(tbl text, n bigint);
      for r in select c.table_name from information_schema.columns c join information_schema.tables t using (table_schema, table_name)
               where c.table_schema='public' and c.column_name='org_id' and t.table_type='BASE TABLE' and c.table_name <> 'orgs' loop
        execute format('select count(*) from public.%I where org_id in (select id from public.orgs where slug like %L escape %L)', r.table_name, '\_w17\_selftest\_%', '\') into k;
        if k > 0 then insert into w17rc values (r.table_name, k); end if;
      end loop; end \$\$;" -c "select tbl||' '||n from w17rc order by tbl;"
    echo "## $tag: ledger"
    psqlc -At -c "select count(*)||' rows, head '||max(version) from supabase_migrations.schema_migrations;"
  } > "$EV/$tag-census.txt" 2>&1
  psqlc -At -c "$(node -e 'import("'"$REPO"'/scripts/release/release-lib.mjs").then(m=>process.stdout.write(m.ORGS_SQL))')" > "$EV/$tag-orgs.txt"
}

REPO=$(git rev-parse --show-toplevel)
ALL=$(ls $SRC | sort)

# ── Run A: fresh, the whole chain from nothing ──────────────────────────────
start A
: > "$EV/A-apply.log"
for f in $ALL; do apply "$f" "$EV/A-apply.log" || { stop A; exit 2; }; done
echo "A chain_result=ALL APPLIED ($(grep -c '\.sql$' "$EV/A-apply.log") files)"
census A-after-chain
stop A

# ── Run B: staging's state, then the migration, then again ──────────────────
start B
: > "$EV/B-apply.log"
for f in $ALL; do [ "$f" = "$NEW" ] && continue; apply "$f" "$EV/B-apply.log" || { stop B; exit 2; }; done
echo "B chain_result=APPLIED to staging head ($(grep -c '\.sql$' "$EV/B-apply.log") files)"
census B1-before-retirement
apply "$NEW" "$EV/B-apply.log" || { stop B; exit 2; }
census B2-after-retirement
# Re-application: the file's own text again (no ledger row: the version is already recorded).
docker exec $C sh -c "psql -U postgres -X -v ON_ERROR_STOP=1 --single-transaction -d postgres -f /tmp/migrations/$NEW" > "$EV/B3-reapply.txt" 2>&1
echo "rc=$?" >> "$EV/B3-reapply.txt"
census B3-after-reapply
# No W-17 org: move its slug out of the pattern, run the file, show nothing changed, roll back.
psqlc > "$EV/B4-no-org-trial.txt" 2>&1 <<SQL
begin;
update public.orgs set slug = 'b1-trial-' || slug where slug like '\\_w17\\_selftest\\_%' escape '\\';
select count(*) as w17_orgs_in_trial from public.orgs where slug like '\\_w17\\_selftest\\_%' escape '\\';
create temp table before_trial as select id, name, slug, status from public.orgs;
\\i /tmp/migrations/$NEW
select count(*) as orgs_changed_by_file from (select id, name, slug, status from public.orgs except select * from before_trial) d;
rollback;
SQL
echo "rc=$?" >> "$EV/B4-no-org-trial.txt"
stop B

#!/bin/bash
# P4 rebuild rehearsal: fresh throwaway Supabase Postgres, platform service schemas (GoTrue, Storage) first,
# then every staging migration in order, one transaction per file. No host ports, no mounts, tmpfs data,
# and the only network ever attached is an --internal one used for the two service migrators, then removed.
# Usage: rehearse.sh <migrations-dir> <evidence-dir>
set -u
SRC=$1; EV=$2
C=alloy-p4-rehearsal-20261125; N=alloy-p4-rehearsal-internal
PW=p4-throwaway   # local-only role password inside a network-less container that is destroyed afterwards
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=p4-throwaway-rebuild)
mkdir -p "$EV"

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
  -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=p4-throwaway-not-a-secret-000000000000 \
  -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$EV/gotrue-migrate.log" 2>&1
echo "gotrue_migrate_rc=$?"
docker run --rm --network $N "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
  -e AUTH_JWT_SECRET=p4-throwaway-not-a-secret-000000000000 -e ANON_KEY=x -e SERVICE_KEY=x \
  -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$EV/storage-migrate.log" 2>&1
echo "storage_migrate_rc=$?"
docker network disconnect $N $C && docker network rm $N >/dev/null
echo "networks_attached=[$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')]"

docker cp "$SRC" $C:/tmp/migrations >/dev/null
docker exec $C psql -U postgres -qX -v ON_ERROR_STOP=1 -c "create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" || exit 1
LOG="$EV/apply.log"; : > "$LOG"
for f in $(docker exec $C ls /tmp/migrations | sort); do
  v=${f%%_*}; n=${f#*_}; n=${n%.sql}
  out=$(docker exec $C sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$n'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" 2>&1); rc=$?
  echo "$rc $f" >> "$LOG"
  if [ $rc -ne 0 ]; then echo "$out" | grep -v NOTICE | tail -20 >> "$LOG"; echo "chain_result=STOPPED at $f"; exit 2; fi
done
echo "chain_result=ALL APPLIED ($(wc -l < "$LOG" | tr -d ' ') files)"

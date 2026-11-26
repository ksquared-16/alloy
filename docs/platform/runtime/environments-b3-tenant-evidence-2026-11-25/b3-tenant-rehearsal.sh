#!/bin/bash
# B3 (briefing M5, M8, §5.6 step 16): the tenant helper and the configuration-only export/import, end to end, local only.
#
#   S  staging stand-in: a throwaway scratch database inside the shared alloy-cert cluster (the E2 seed's documented
#      proof path: cloned from the stack's postgres, so it holds 133 other orgs, the two ZZ Alloy QA orgs among them),
#      with the Firefly org planted by its real id and the E2 seed applied to it (bare shape: the seed authors
#      campuses, rooms, programs, role types and the lead_management Enrollment process). Dropped afterwards.
#   N  new-project stand-in: a throwaway Supabase Postgres container (tmpfs, no mounts) built from nothing with this
#      branch's migration chain, as B2 did, then served by a throwaway PostgREST and GoTrue from the local images,
#      behind a 127.0.0.1-only proxy that gives them the hosted /rest/v1 and /auth/v1 shape. Removed afterwards.
#
# No hosted service, no credential, no supabase CLI. The operator commands run exactly as step 16 runs them, with
# --target local instead of --target production; the export runs as the owner's operator would run it against
# staging, with --target local.
#
# Then the step-16 failure path (briefing §7): the removal SQL's refusals, the removal itself proven against the
# step-9 census, and step 16 run again on the same project, this time with lane work units for the repair to derive.
#
# Usage: b3-tenant-rehearsal.sh <evidence-dir>   (it replaces that directory's previous outputs)
set -u
EV=$1; mkdir -p "$EV"; EV=$(cd "$EV" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel); WEB=$REPO/web
REL="node $REPO/scripts/release/alloy-release.mjs"
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
REST=public.ecr.aws/supabase/postgrest:v16.1
PW=b3-throwaway                                        # local-only role password, container destroyed afterwards
JWT_SECRET=b3-throwaway-jwt-secret-not-a-secret-00000000  # signs the throwaway service key; never a real secret
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=b3-tenant-throwaway)
C=alloy-b3-newproj; MIGNET=alloy-b3-migrate-net; SRVNET=alloy-b3-serve-net
SHARED=supabase_db_alloy-cert
SRC_DB=firefly_seed_scratch_b3_source
SRC_URL=postgresql://postgres:postgres@127.0.0.1:54422/$SRC_DB
FIREFLY_STAGING_ORG=93667019-bd28-49b5-a688-acc9bb1e0a19
ADMIN_EMAIL=firefly-admin@b3-rehearsal.invalid
T=/tmp/alloy-b3; rm -rf "$T" "$EV"/*.log "$EV"/*.txt "$EV"/*.json "$EV/release" "$EV/refusals"; mkdir -p "$T" "$EV/release" "$EV/refusals"

cleanup() {
  [ -n "${PROXY_PID:-}" ] && kill "$PROXY_PID" 2>/dev/null
  docker rm -f $C alloy-b3-rest alloy-b3-auth >/dev/null 2>&1
  for n in $MIGNET $SRVNET; do docker network rm $n >/dev/null 2>&1; done
  docker exec $SHARED dropdb -U supabase_admin --if-exists $SRC_DB >/dev/null 2>&1
  echo "teardown: containers=[$(docker ps -aq --filter label=alloy.purpose=b3-tenant-throwaway | tr '\n' ' ')] networks=[$(docker network ls -q --filter label=alloy.purpose=b3-tenant-throwaway | tr '\n' ' ')] scratch_db=[$(docker exec $SHARED psql -U supabase_admin -d postgres -Atc "select datname from pg_database where datname = '$SRC_DB'")]"
}
trap cleanup EXIT

tc() { (cd "$WEB" && npm run -s tenant:create -- "$@"); }
tx() { (cd "$WEB" && TENANT_CONFIG_EXPORT_DATABASE_URL=${TENANT_CONFIG_EXPORT_DATABASE_URL:-$SRC_URL} npm run -s tenant:config:export -- "$@"); }
ti() { (cd "$WEB" && npm run -s tenant:config:import -- "$@"); }
NEWDB() { docker exec -i $C psql -U postgres -d postgres "$@"; }

# ── S: the staging stand-in, seeded with the E2 seed ────────────────────────
echo "## S: staging stand-in (scratch database in the shared cluster)"
docker exec $SHARED sh -c "createdb -U supabase_admin $SRC_DB && pg_dump -U supabase_admin postgres | psql -U supabase_admin -q $SRC_DB" > "$T/source-clone.log" 2>&1
echo "source clone rc=$? orgs=$(psql "$SRC_URL" -Atc 'select count(*) from public.orgs')"
psql "$SRC_URL" -q -c "INSERT INTO public.orgs (id, name, slug) VALUES ('$FIREFLY_STAGING_ORG', 'Firefly Early Learning', 'firefly-early-learning') ON CONFLICT (id) DO NOTHING;"
(cd "$WEB" && FIREFLY_STAGING_SEED_DATABASE_URL=$SRC_URL npm run -s staging:seed:firefly -- apply --target local) > "$EV/source-seed-apply.txt" 2>&1
echo "E2 seed apply rc=$? ($(grep -c '^ *PASS' "$EV/source-seed-apply.txt") PASS, $(grep -c '^ *FAIL' "$EV/source-seed-apply.txt") FAIL; $(grep -m1 'seed authors' "$EV/source-seed-apply.txt"))"

# ── export, and the export's refusals ───────────────────────────────────────
echo "## export (M8)"
tx --target local --org-id $FIREFLY_STAGING_ORG --keep-seed-config --out "$EV/firefly-config-export.json" 2>&1 | tee "$EV/export.txt"
SHA=$(shasum -a 256 "$EV/firefly-config-export.json" | cut -d' ' -f1); echo "export sha256 $SHA"
tx --target local --org-id $FIREFLY_STAGING_ORG --kinds sites,rooms,children,charge_templates,provider_bindings --out "$T/never.json" > "$EV/refusals/export-kinds-outside-allowlist.txt" 2>&1
echo "export --kinds with children, charge_templates, provider_bindings rc=$? (expected 4); file written: $([ -e "$T/never.json" ] && echo yes || echo no)"
tx --target local --org-id $FIREFLY_STAGING_ORG --out "$EV/refusals/export-without-keep-seed-config.json" > "$EV/refusals/export-without-keep-seed-config.txt" 2>&1
echo "export without --keep-seed-config rc=$? (expected 0, every seed row left behind): $(node -e 'const f=require(process.argv[1]); console.log(JSON.stringify(Object.fromEntries(Object.entries(f.kinds).map(([k,v])=>[k,v.length]))), "left_behind", f.left_behind.length)' "$EV/refusals/export-without-keep-seed-config.json")"
ALLOY_ENVIRONMENT=staging tx --target staging --org-id $FIREFLY_STAGING_ORG --out "$T/x.json" > "$EV/refusals/export-staging-without-url.txt" 2>&1
echo "export --target staging with no URL rc=$? (expected 3)"
TENANT_CONFIG_EXPORT_DATABASE_URL='postgresql://postgres:x@db.vslwnntzzgpnmrpjipat.supabase.co:5432/postgres' ALLOY_ENVIRONMENT=staging \
  tx --target staging --confirm-project-ref ikaxilmwmrmbagoidedu --org-id $FIREFLY_STAGING_ORG --out "$T/x.json" > "$EV/refusals/export-production-url.txt" 2>&1
echo "export from the production project rc=$? (expected 3)"
tx --target local --org-id $FIREFLY_STAGING_ORG --keep-seed-config --out "$EV/firefly-config-export.json" > "$EV/refusals/export-overwrite.txt" 2>&1
echo "export over an existing file rc=$? (expected 3)"

# ── N: the new project, from nothing ────────────────────────────────────────
echo "## N: new-project stand-in"
docker network create --internal "${LBL[@]}" $MIGNET >/dev/null || exit 1
docker run -d --name $C --network $MIGNET --tmpfs /var/lib/postgresql/data:size=4g "${LBL[@]}" -e POSTGRES_PASSWORD=$PW $PG >/dev/null || exit 1
for i in $(seq 1 60); do
  docker logs $C 2>&1 | grep -q 'init process complete' && docker exec $C pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 2
done
docker exec $C psql -U supabase_admin -d postgres -qAt -c "alter role supabase_auth_admin password '$PW'" -c "alter role supabase_storage_admin password '$PW'" -c "alter role authenticator password '$PW'" || exit 1
docker run --rm --network $MIGNET "${LBL[@]}" --entrypoint auth -e GOTRUE_DB_DRIVER=postgres -e DB_NAMESPACE=auth \
  -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=$JWT_SECRET \
  -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$T/gotrue-migrate.log" 2>&1
echo "gotrue_migrate_rc=$?"
docker run --rm --network $MIGNET "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
  -e AUTH_JWT_SECRET=$JWT_SECRET -e ANON_KEY=x -e SERVICE_KEY=x \
  -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$T/storage-migrate.log" 2>&1
echo "storage_migrate_rc=$?"
# The internal network is detached before any migration runs; it is removed at teardown (a container cannot join
# another network once the one it was created on is gone).
docker network disconnect $MIGNET $C || exit 1
echo "networks attached during the chain: [$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')]"

git -C "$REPO" archive HEAD supabase/migrations | tar -x -C "$T" || exit 1
docker cp "$T/supabase/migrations" $C:/tmp/migrations >/dev/null
NEWDB -qX -v ON_ERROR_STOP=1 -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" || exit 1
: > "$EV/chain-apply.log"
for f in $(ls "$T/supabase/migrations" | sort); do
  v=${f%%_*}; n=${f#*_}; n=${n%.sql}
  docker exec $C sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$n'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" > /dev/null 2>&1
  rc=$?; echo "$rc $f" >> "$EV/chain-apply.log"; [ $rc -ne 0 ] && { echo "chain STOPPED at $f"; exit 2; }
done
echo "chain: $(wc -l < "$EV/chain-apply.log" | tr -d ' ') files applied, head $(ls "$T/supabase/migrations" | sort | tail -1)"
# Step 9's baseline, as the window takes it (briefing §4 item 6; release runbook)
$REL emit-sql census | NEWDB -At -X -f - > "$EV/release/census-extras.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$EV/release/census-orgs.txt"
echo "step-9 stand-in orgs: $(tr '\n' ' ' < "$EV/release/census-orgs.txt")"

# serve it with the hosted API shape, on 127.0.0.1 only
docker network create "${LBL[@]}" $SRVNET >/dev/null || exit 1
docker network connect $SRVNET $C || exit 1
docker run -d --name alloy-b3-rest --network $SRVNET -p 127.0.0.1::3000 "${LBL[@]}" \
  -e "PGRST_DB_URI=postgres://authenticator:$PW@$C:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=$JWT_SECRET -e PGRST_DB_USE_LEGACY_GUCS=false $REST >/dev/null || exit 1
docker run -d --name alloy-b3-auth --network $SRVNET -p 127.0.0.1::9999 "${LBL[@]}" --entrypoint auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 \
  -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" \
  -e GOTRUE_JWT_SECRET=$JWT_SECRET -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=true $AUTH serve >/dev/null || exit 1
RESTP=$(docker port alloy-b3-rest 3000/tcp | head -1 | sed 's/.*://'); AUTHP=$(docker port alloy-b3-auth 9999/tcp | head -1 | sed 's/.*://')
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$RESTP/" >/dev/null && curl -sf "http://127.0.0.1:$AUTHP/health" >/dev/null && break; sleep 1; done
node "$HERE/api-proxy.mjs" "$RESTP" "$AUTHP" "$T/proxy.port" & PROXY_PID=$!
for i in $(seq 1 20); do [ -s "$T/proxy.port" ] && break; sleep 0.5; done
API=http://127.0.0.1:$(cat "$T/proxy.port")
echo "served: rest 127.0.0.1:$RESTP auth 127.0.0.1:$AUTHP api $API"
SERVICE_KEY=$(node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",iss:"supabase",iat:1764000000,exp:2000000000});console.log(h+"."+p+"."+c.createHmac("sha256",process.argv[1]).update(h+"."+p).digest("base64url"))' "$JWT_SECRET")
export ALLOY_OPERATOR_SERVICE_ROLE_KEY=$SERVICE_KEY

# step 16 (3.1): the owner adds the named admin in Auth (a dashboard action; here, the Auth admin API)
ADMIN=$(curl -s -X POST "$API/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"email_confirm\":true}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id??""))')
echo "admin auth user: $ADMIN ($ADMIN_EMAIL)"; [ -n "$ADMIN" ] || exit 1

# ── M5: the tenant helper ───────────────────────────────────────────────────
echo "## M5: tenant:create"
BASE=(--name "Firefly Early Learning" --slug firefly-early-learning --industry childcare --admin-user-id "$ADMIN" --admin-email $ADMIN_EMAIL)
CREATE=("${BASE[@]}" --admin-full-name "Firefly Admin (B3 rehearsal)")
L=(--log "$EV/step16-tenant-create.log")
echo "firefly-early-learning" | tc --target local --supabase-url "$API" "${BASE[@]}" "${L[@]}" > "$EV/refusals/create-admin-unnamed.txt" 2>&1; echo "create for an admin account with no name, no --admin-full-name rc=$? (expected 4; orgs now $(curl -s "$API/rest/v1/orgs?select=id" -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).length))'))"
tc --target production --supabase-url https://ikaxilmwmrmbagoidedu.supabase.co --project-ref ikaxilmwmrmbagoidedu "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-staging-url.txt" 2>&1; echo "create on staging rc=$? (expected 3)"
tc --target production --supabase-url https://vslwnntzzgpnmrpjipat.supabase.co --project-ref vslwnntzzgpnmrpjipat "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-previous-production.txt" 2>&1; echo "create on the previous production project rc=$? (expected 3)"
tc --target production --supabase-url https://rehearsalnewprojectr.supabase.co --project-ref rehearsalnewprojectr "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-production-undeclared.txt" 2>&1; echo "create on production without ALLOY_ENVIRONMENT rc=$? (expected 3)"
ALLOY_ENVIRONMENT=production tc --target production --supabase-url https://rehearsalnewprojectr.supabase.co --project-ref rehearsalnewprojectx "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-production-ref-mismatch.txt" 2>&1; echo "create with a mistyped --project-ref rc=$? (expected 3)"
tc --target local --supabase-url "$API" --name "Firefly Early Learning" --slug firefly-early-learning --industry childcare --admin-user-id "$ADMIN" --admin-email someone-else@b3-rehearsal.invalid --admin-full-name x "${L[@]}" > "$EV/refusals/create-admin-email-mismatch.txt" 2>&1; echo "create with the wrong admin email rc=$? (expected 4)"
tc --target local --supabase-url "$API" "${CREATE[@]}" "${L[@]}" --dry-run 2>&1 | tee "$EV/create-dry-run.txt" | tail -6
echo "wrong-answer" | tc --target local --supabase-url "$API" "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-not-confirmed.txt" 2>&1; echo "create, confirmation mistyped rc=$? (expected 2)"
echo "firefly-early-learning" | tc --target local --supabase-url "$API" "${CREATE[@]}" "${L[@]}" 2>&1 | tee "$EV/create.txt"
ORG=$(sed -n 's/^ORG_ID=//p' "$EV/create.txt"); echo "new org: $ORG"; [ -n "$ORG" ] || exit 1
echo "firefly-early-learning" | tc --target local --supabase-url "$API" "${CREATE[@]}" "${L[@]}" > "$EV/refusals/create-duplicate-slug.txt" 2>&1; echo "create again rc=$? (expected 4)"
echo "firefly-2" | tc --target local --supabase-url "$API" --name "FIREFLY early learning" --slug firefly-2 --industry childcare --admin-user-id "$ADMIN" --admin-email $ADMIN_EMAIL "${L[@]}" > "$EV/refusals/create-duplicate-name.txt" 2>&1; echo "create with the same name, another slug rc=$? (expected 4)"

# ── M8: the import ──────────────────────────────────────────────────────────
echo "## M8: tenant:config:import"
IMP=(--target local --supabase-url "$API" --org-id "$ORG" --admin-user-id "$ADMIN" --log "$EV/step16-import.log")
F=(--file "$EV/firefly-config-export.json" --expect-sha256 "$SHA")
ti plan "${IMP[@]}" "${F[@]}" 2>&1 | tee "$EV/import-plan.txt" | tail -3
echo "${ORG:0:8}" | ti apply "${IMP[@]}" "${F[@]}" 2>&1 | tee "$EV/import-apply.txt" | tail -4
$REL emit-sql census | NEWDB -At -X -f - > "$EV/release/after-step16-census-extras.txt"
ti verify "${IMP[@]}" "${F[@]}" --baseline "$EV/release/census-extras.txt" --after-census "$EV/release/after-step16-census-extras.txt" 2>&1 | tee "$EV/import-verify.txt"
echo "verify rc=${PIPESTATUS[0]}"
echo "${ORG:0:8}" | ti apply "${IMP[@]}" "${F[@]}" 2>&1 | tee "$EV/import-apply-again.txt" | tail -2
ti plan "${IMP[@]}" "${F[@]}" > "$EV/import-plan-after.txt" 2>&1; echo "plan after: $(grep '^summary' "$EV/import-plan-after.txt")"

# the import's refusals: files outside the allowlist, a changed file, a seed-kept file on production
tamper() { node -e 'const fs=require("fs");const f=JSON.parse(fs.readFileSync(process.argv[1]));('"$1"')(f);fs.writeFileSync(process.argv[2],JSON.stringify(f,null,2)+"\n")' "$EV/firefly-config-export.json" "$2"; }
tamper 'f=>{f.kinds.customers=[{ref:"customer:x",name:"Alder Family"}]}' "$T/with-customers.json"
tamper 'f=>{f.kinds.sites[0].email="office@example.invalid"}' "$T/with-field.json"
tamper 'f=>{f.kinds.rooms[0].metadata.qa_run_id="qar_x"}' "$T/with-metadata.json"
tamper 'f=>{f.kinds.sites[0].label="Old site "+f.source.org_id}' "$T/with-id.json"
tamper 'f=>{f.kinds.provider_bindings=[]}' "$T/with-bindings.json"
for x in with-customers with-field with-metadata with-id with-bindings; do
  S=$(shasum -a 256 "$T/$x.json" | cut -d' ' -f1)
  ti plan "${IMP[@]}" --file "$T/$x.json" --expect-sha256 "$S" > "$EV/refusals/import-$x.txt" 2>&1; echo "import plan $x rc=$? (expected 4): $(grep -m1 -A1 'refused' "$EV/refusals/import-$x.txt" | tail -1 | sed 's/^ *- //')"
done
ti plan "${IMP[@]}" --file "$T/with-customers.json" --expect-sha256 "$SHA" > "$EV/refusals/import-sha-mismatch.txt" 2>&1; echo "import with a file that is not the approved one rc=$? (expected 4)"
ALLOY_ENVIRONMENT=production ti plan --target production --supabase-url https://rehearsalnewprojectr.supabase.co --project-ref rehearsalnewprojectr --org-id "$ORG" --admin-user-id "$ADMIN" --log "$T/x.log" "${F[@]}" > "$EV/refusals/import-seed-kept-on-production.txt" 2>&1; echo "a seed-kept file aimed at production rc=$? (expected 4)"

# ── §5.6 by the release tool's own read: orgs, and what step 16 changed ─────
$REL emit-sql orgs | NEWDB -At -X -f - > "$EV/release/after-step16-orgs.txt"
$REL emit-sql census | NEWDB -At -X -f - > "$T/after-refusals-census.txt"
cmp -s "$EV/release/after-step16-census-extras.txt" "$T/after-refusals-census.txt" && echo "the re-run and every refusal changed no row count" || echo "ROW COUNTS MOVED after verify"
echo "orgs after step 16: $(tr '\n' ' ' < "$EV/release/after-step16-orgs.txt")"
diff "$EV/release/census-extras.txt" "$EV/release/after-step16-census-extras.txt" > "$EV/release/step16-census-diff.txt"
echo "tables step 16 changed: $(grep -c '^>' "$EV/release/step16-census-diff.txt")"

# ── §7: step 16 fails its checks → remove what it wrote, prove it, run step 16 again ──
echo "## rollback (§7)"
RB() { (cd "$WEB" && npm run -s tenant:rollback-sql) | NEWDB -X "$@" -f -; }
census() { $REL emit-sql census | NEWDB -At -X -f - > "$1"; }
RB -v org_id="$ORG" -v "org_name=Firefly Early" > "$EV/refusals/rollback-name-mismatch.txt" 2>&1; echo "rollback with the wrong org name rc=$? (expected 3): $(grep -m1 ERROR "$EV/refusals/rollback-name-mismatch.txt")"
W17=$(sed -n 's/|retired|.*//p' "$EV/release/census-orgs.txt")
RB -v org_id="$W17" -v "org_name=_w17_selftest_${W17:0:8}" > "$EV/refusals/rollback-w17.txt" 2>&1; echo "rollback aimed at the W-17 org rc=$? (expected 3): $(grep -m1 ERROR "$EV/refusals/rollback-w17.txt")"
NEWDB -qAtX -c "insert into public.customers (org_id, name) values ('$ORG', 'B3 window-closed probe')"
RB -v org_id="$ORG" -v "org_name=Firefly Early Learning" > "$EV/refusals/rollback-window-closed.txt" 2>&1; echo "rollback with a customer written rc=$? (expected 3): $(grep -m1 ERROR "$EV/refusals/rollback-window-closed.txt")"
NEWDB -qAtX -c "delete from public.customers where org_id = '$ORG'"
census "$T/before-rollback.txt"
grep -v '^rows:customers|' "$T/before-rollback.txt" | cmp -s - <(grep -v '^rows:customers|' "$EV/release/after-step16-census-extras.txt") && echo "the refused rollbacks changed nothing (beyond the probe's own customer row, written and removed)" || echo "ROW COUNTS MOVED during the refused rollbacks"
RB -v org_id="$ORG" -v "org_name=Firefly Early Learning" > "$EV/rollback.txt" 2>&1; RC=$?; echo "rollback rc=$RC : $(grep -m1 -E 'removed org|ERROR' "$EV/rollback.txt" | sed -E 's/^.*(NOTICE|ERROR): *//')"
census "$EV/release/after-rollback-census-extras.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$EV/release/after-rollback-orgs.txt"
diff "$EV/release/census-extras.txt" "$EV/release/after-rollback-census-extras.txt" > "$EV/release/rollback-census-diff.txt" && echo "after the rollback the census equals step 9's: removal complete" || echo "ROLLBACK INCOMPLETE: $(grep -c '^[<>]' "$EV/release/rollback-census-diff.txt") line(s) differ from step 9"
cmp -s "$EV/release/census-orgs.txt" "$EV/release/after-rollback-orgs.txt" && echo "orgs equal step 9's: $(tr '\n' ' ' < "$EV/release/after-rollback-orgs.txt")" || echo "ORGS DIFFER from step 9"
echo "auth users kept for the retry: $(NEWDB -AtX -c 'select count(*) from auth.users')"
[ $RC -eq 0 ] || exit 1

echo "## step 16 again, on the same project"
# A variant of the export that names the source's lane work units (as staging's may: P3 C2). The repair derives a lane
# only from status definitions assigned to its stage (P3 C14, not transferred), so the plan must block it before any write.
node -e 'const fs=require("fs");const f=JSON.parse(fs.readFileSync(process.argv[1]));for(const e of f.kinds.enrollment_process)e.derived_work_unit_keys=e.process.stages.filter(s=>s.is_active!==false).map(s=>"lifecycle_wu_"+s.key).sort();fs.writeFileSync(process.argv[2],JSON.stringify(f,null,2)+"\n")' "$EV/firefly-config-export.json" "$EV/firefly-config-export-with-work-units.json"
SHA2=$(shasum -a 256 "$EV/firefly-config-export-with-work-units.json" | cut -d' ' -f1)
echo "firefly-early-learning" | tc --target local --supabase-url "$API" "${CREATE[@]}" "${L[@]}" > "$EV/retry-create.txt" 2>&1; echo "create again after the rollback rc=$?"
ORG2=$(sed -n 's/^ORG_ID=//p' "$EV/retry-create.txt"); echo "new org: $ORG2"; [ -n "$ORG2" ] || exit 1
IMP2=(--target local --supabase-url "$API" --org-id "$ORG2" --admin-user-id "$ADMIN" --log "$EV/step16-retry-import.log")
census "$T/after-retry-create.txt"
ti plan "${IMP2[@]}" --file "$EV/firefly-config-export-with-work-units.json" --expect-sha256 "$SHA2" > "$EV/refusals/import-plan-lanes-without-statuses.txt" 2>&1
echo "plan with lane work units rc=$?: $(grep -E '^ *blocked' "$EV/refusals/import-plan-lanes-without-statuses.txt" | sed 's/  */ /g' | cut -c1-160)"
echo "${ORG2:0:8}" | ti apply "${IMP2[@]}" --file "$EV/firefly-config-export-with-work-units.json" --expect-sha256 "$SHA2" > "$EV/refusals/import-apply-lanes-without-statuses.txt" 2>&1
echo "apply with lane work units rc=$? (expected 4): $(grep -m1 '✗' "$EV/refusals/import-apply-lanes-without-statuses.txt")"
census "$T/after-blocked-apply.txt"; cmp -s "$T/after-retry-create.txt" "$T/after-blocked-apply.txt" && echo "the blocked apply wrote nothing" || echo "THE BLOCKED APPLY WROTE ROWS"
F=(--file "$EV/firefly-config-export.json" --expect-sha256 "$SHA")
echo "${ORG2:0:8}" | ti apply "${IMP2[@]}" "${F[@]}" > "$EV/retry-import-apply.txt" 2>&1; echo "retry import (the reviewed file) rc=$?: $(tail -1 "$EV/retry-import-apply.txt")"
census "$EV/release/after-retry-census-extras.txt"
ti verify "${IMP2[@]}" "${F[@]}" --baseline "$EV/release/census-extras.txt" --after-census "$EV/release/after-retry-census-extras.txt" > "$EV/retry-import-verify.txt" 2>&1
echo "retry verify rc=$?"; grep -E '^(PASS|FAIL)' "$EV/retry-import-verify.txt" | cut -c1-140
echo "${ORG2:0:8}" | ti apply "${IMP2[@]}" "${F[@]}" > "$EV/retry-import-apply-again.txt" 2>&1; echo "retry import again rc=$?: $(tail -1 "$EV/retry-import-apply-again.txt")"
$REL emit-sql orgs | NEWDB -At -X -f - > "$EV/release/after-retry-orgs.txt"
echo "orgs at the end: $(tr '\n' ' ' < "$EV/release/after-retry-orgs.txt")"

#!/bin/bash
# B4 (ALY-14 briefing steps 1–3, 5, 7–9, 11–17 and §7): the whole first promotion as one local dress rehearsal, timed
# step by step against the window. Every release-tool and tenant command runs from a scratch worktree of the simulated
# candidate, as the window runs them from the rebuilt candidate's checkout; only the database and HTTP targets are
# local stand-ins.
#
#   candidate  step 1's merge simulated with git objects (this branch into origin/staging, no fetch, no push), checked
#              out as a detached scratch worktree; P4 build-candidate.sh / migration-counts.sh over local refs
#   N          the new project: throwaway Supabase Postgres (tmpfs) with GoTrue/Storage platform schemas, attached
#              ONLY to an --internal network (no egress, so the chain's staging fallback can reach nothing)
#   S          staging stand-in: the same chain applied as staging's own path did (ledger and fingerprint to compare)
#   API        throwaway PostgREST + GoTrue over N, behind B3's 127.0.0.1 proxy (the hosted /rest/v1, /auth/v1 shape)
#   harness    the candidate's own /api/build-info and /api/scheduled-work/wake handlers on 127.0.0.1
#              (route-harness.ts), with the environment a production deployment of the candidate carries
#   relay      a TCP relay on the internal network: the only thing N's pg_net can reach, forwarding to the harness;
#              the "production origin" of steps 12–14
#   source     step 6's export source: a scratch database in the shared alloy-cert cluster with the E2 seed (as B3)
#   F          a second throwaway new project, for the step-9 failure path (§7 "hold")
#
# No hosted service, no credential, no supabase CLI, no fetch or push. Teardown removes every container, network,
# the scratch database and the scratch worktree.
#
# Usage: b4-dress-rehearsal.sh <evidence-dir>   (replaces that directory's previous outputs; ~20 minutes, two of
# them waiting for real pg_cron ticks)
set -u
EV=$1; mkdir -p "$EV"; EV=$(cd "$EV" && pwd)
HERE=$(cd "$(dirname "$0")" && pwd)
REPO=$(git -C "$HERE" rev-parse --show-toplevel)
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
REST=public.ecr.aws/supabase/postgrest:v16.1
PW=b4-throwaway                                          # local-only role password; containers destroyed afterwards
JWT_SECRET=b4-throwaway-jwt-secret-not-a-secret-00000000 # signs the throwaway service key; never a real secret
CRON_TOKEN=b4-throwaway-internal-cron-token-0000         # stands in for production INTERNAL_CRON_TOKEN
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=b4-dress-rehearsal-throwaway)
NEW_REF=rehearsalnewprojectr                             # invented; the window uses the step-5 ref
OLD_REF=vslwnntzzgpnmrpjipat
N=alloy-b4-new; S=alloy-b4-staging; F=alloy-b4-failpath
INT=alloy-b4-int; BR=alloy-b4-br; SNET=alloy-b4-staging-net; FNET=alloy-b4-failpath-net
SHARED=supabase_db_alloy-cert
SRC_DB=firefly_seed_scratch_b4_source
SRC_URL=postgresql://postgres:postgres@127.0.0.1:54422/$SRC_DB
FIREFLY_STAGING_ORG=93667019-bd28-49b5-a688-acc9bb1e0a19
ADMIN_EMAIL=firefly-admin@b4-rehearsal.invalid
CWT=/private/tmp/alloy-b4-candidate-wt   # realpath: alloy-release.mjs runs only when argv[1] is its own path
T=/tmp/alloy-b4; D=$EV/release
rm -rf "$T" "$EV"/*.log "$EV"/*.txt "$EV"/*.json "$EV"/*.jsonl "$EV"/*.tsv "$EV/release" "$EV/refusals" "$EV/rollback"
mkdir -p "$T" "$D" "$EV/refusals" "$EV/rollback"

cleanup() {
  [ -n "${PROXY_PID:-}" ] && kill "$PROXY_PID" 2>/dev/null
  [ -n "${HPID:-}" ] && kill "$HPID" 2>/dev/null; pkill -f b4-route-harness 2>/dev/null
  docker rm -f $N $S $F alloy-b4-rest alloy-b4-auth alloy-b4-relay >/dev/null 2>&1
  for n in $INT $BR $SNET $FNET; do docker network rm $n >/dev/null 2>&1; done
  docker exec $SHARED dropdb -U supabase_admin --if-exists $SRC_DB >/dev/null 2>&1
  git -C "$REPO" worktree remove --force "$CWT" >/dev/null 2>&1; git -C "$REPO" worktree prune
  echo "teardown: containers=[$(docker ps -aq --filter label=alloy.purpose=b4-dress-rehearsal-throwaway | tr '\n' ' ')] networks=[$(docker network ls -q --filter label=alloy.purpose=b4-dress-rehearsal-throwaway | tr '\n' ' ')] scratch_db=[$(docker exec $SHARED psql -U supabase_admin -d postgres -Atc "select datname from pg_database where datname = '$SRC_DB'")] scratch_worktree=[$(git -C "$REPO" worktree list | grep -c "$CWT")]"
}
trap cleanup EXIT

# ── timing: one row per briefing step, against its slot in the three-hour window ──
TS=$EV/timings.tsv; printf 'step\twindow_slot\tbudget_s\tmeasured_s\tresult\n' > "$TS"
t0() { T0=$(date +%s); }
t1() { printf '%s\t%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$(( $(date +%s) - T0 ))" "$4" >> "$TS"; echo "⏱  $1: $(( $(date +%s) - T0 ))s (slot $2, budget ${3}s) — $4"; }
die() { echo "STOP: $*"; exit 2; }

NEWDB() { docker exec -i $N psql -U postgres -d postgres "$@"; }
STGDB() { docker exec -i $S psql -U postgres -d postgres "$@"; }
FDB() { docker exec -i $F psql -U postgres -d postgres "$@"; }
q1() { NEWDB -AtX -c "$1"; }

# ════════════════════════════════════════════════════════════════════════════
echo "## steps 1–3: the candidate (local refs only; nothing sent to any remote)"
t0
BRANCH=$(git -C "$REPO" rev-parse HEAD); MAIN=$(git -C "$REPO" rev-parse origin/main); OSTAGING=$(git -C "$REPO" rev-parse origin/staging)
cd "$REPO"
export GIT_AUTHOR_NAME=Sim GIT_AUTHOR_EMAIL=sim@invalid GIT_COMMITTER_NAME=Sim GIT_COMMITTER_EMAIL=sim@invalid
export GIT_AUTHOR_DATE=2026-11-25T00:00:00Z GIT_COMMITTER_DATE=2026-11-25T00:00:00Z
TREE=$(git merge-tree --write-tree "$BRANCH" "$OSTAGING" | head -1) || die "step 1: the merge conflicts"
STAGING=$(echo "simulated step-1 merge (B4 dress rehearsal)" | git commit-tree "$TREE" -p "$OSTAGING" -p "$BRANCH")
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
echo "branch=$BRANCH origin/staging=$OSTAGING origin/main=$MAIN simulated_staging=$STAGING" | tee "$EV/candidate.txt"
t1 "1 staging merge (simulated)" "before the window" 0 "merge-tree exit 0; merge $STAGING"
t0
CAND=$(bash "$REPO/docs/platform/runtime/environments-p4-evidence-2026-11-25/candidate/build-candidate.sh" "$STAGING" "$MAIN") || die "step 2: build-candidate failed"
echo "candidate=$CAND" | tee -a "$EV/candidate.txt"
git worktree add --detach "$CWT" "$CAND" > "$T/worktree-add.log" 2>&1 || die "scratch worktree"
ln -s "$REPO/web/node_modules" "$CWT/web/node_modules"
cp "$HERE/route-harness.ts" "$CWT/web/scripts/b4-route-harness.ts"
REL="node $CWT/scripts/release/alloy-release.mjs"
REFS=(--staging "$STAGING" --main "$MAIN" --candidate "$CAND")
$REL identify "${REFS[@]}" > "$EV/identify-no-allowance.json"; RC=$?
echo "identify (no --allow-tree-diff) rc=$RC tree_diff_from_staging=$(node -e 'const j=require(process.argv[1]);console.log(JSON.stringify(j.tree_diff_from_staging ?? j.candidate?.tree_diff_from_staging ?? null))' "$EV/identify-no-allowance.json")"
git merge-base --is-ancestor "$MAIN" "$CAND" && echo "main fast-forwards to the candidate: yes" || die "main does not fast-forward"
[ $RC -eq 0 ] || die "§2 stop condition: identify exit $RC"
t1 "2 rebuild + identify" "before the window" 0 "identify exit 0, no allowance"
t0
bash "$REPO/docs/platform/runtime/environments-p4-evidence-2026-11-25/candidate/migration-counts.sh" origin/staging origin/main "$CAND" > "$EV/migration-counts.txt" 2>&1
FILES=$(git ls-tree --name-only "$CAND" supabase/migrations/ | wc -l | tr -d ' ')
HEADV=$(git ls-tree --name-only "$CAND" supabase/migrations/ | sed 's|.*/||' | sort | tail -1)
NEWFILES=$(git diff --name-only --diff-filter=A "$OSTAGING" "$CAND" -- supabase/migrations/ | sed 's|.*/||')
echo "candidate migrations: $FILES files, head $HEADV; added by step 1: $(echo "$NEWFILES" | grep -c .) ($(echo $NEWFILES))" | tee -a "$EV/candidate.txt"
SCHED=$(git grep -l -E '^\s*schedule:' "$CAND" -- .github/workflows/ | sed "s|^$CAND:||")
echo "candidate workflows with schedule: [${SCHED}]" | tee -a "$EV/candidate.txt"
git grep -n DrawerSummaryStripBoundary "$CAND" -- web | sed "s|^$CAND:||" > "$EV/drawer-strip-readers.txt"
echo "DrawerSummaryStripBoundary hits: $(wc -l < "$EV/drawer-strip-readers.txt" | tr -d ' ') ($(cut -d: -f1 "$EV/drawer-strip-readers.txt" | sort -u | grep -vc '^web/tests/') outside web/tests/)" | tee -a "$EV/candidate.txt"
t1 "3 recount + recheck" "before the window" 0 "$FILES files, head ${HEADV%%_*}"

# ════════════════════════════════════════════════════════════════════════════
echo "## stand-ins: the new project N (internal network only) and staging S"
t0
docker network create --internal "${LBL[@]}" $INT >/dev/null || die "network"
docker network create "${LBL[@]}" $BR >/dev/null || die "network"
docker network create --internal "${LBL[@]}" $SNET >/dev/null || die "network"
boot() {  # <container> <network> <label>
  local C=$1 NET=$2
  docker run -d --name $C --network $NET --tmpfs /var/lib/postgresql/data:size=4g "${LBL[@]}" -e POSTGRES_PASSWORD=$PW $PG >/dev/null || die "boot $C"
  for i in $(seq 1 60); do
    docker logs $C 2>&1 | grep -q 'init process complete' && docker exec $C pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec $C psql -U supabase_admin -d postgres -qAt -c "alter role supabase_auth_admin password '$PW'" -c "alter role supabase_storage_admin password '$PW'" -c "alter role authenticator password '$PW'" || die "roles $C"
  docker run --rm --network $NET "${LBL[@]}" --entrypoint auth -e GOTRUE_DB_DRIVER=postgres -e DB_NAMESPACE=auth \
    -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=$JWT_SECRET \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$T/$3-gotrue.log" 2>&1
  local g=$?
  docker run --rm --network $NET "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
    -e AUTH_JWT_SECRET=$JWT_SECRET -e ANON_KEY=x -e SERVICE_KEY=x \
    -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$T/$3-storage.log" 2>&1
  echo "$3: platform schemas gotrue_rc=$g storage_rc=$? networks=[$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')]"
}
boot $N $INT new
boot $S $SNET staging
docker network disconnect $SNET $S
git -C "$REPO" archive "$CAND" supabase/migrations | tar -x -C "$T" || die "archive"
docker cp "$T/supabase/migrations" $S:/tmp/migrations >/dev/null
STGDB -qX -v ON_ERROR_STOP=1 -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" || die "S ledger"
: > "$T/staging-standin-apply.log"
for f in $(ls "$T/supabase/migrations" | sort); do
  v=${f%%_*}; n=${f#*_}; n=${n%.sql}
  docker exec $S sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$n'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" > /dev/null 2>&1
  rc=$?; echo "$rc $f" >> "$T/staging-standin-apply.log"; [ $rc -ne 0 ] && die "staging stand-in stopped at $f"
done
echo "staging stand-in: $(grep -c '^0 ' "$T/staging-standin-apply.log") files applied"
t1 "stand-ins ready (not a window step)" "-" 0 "N empty with auth/storage; S at the candidate's chain"

# step 6 source (not timed in the window): Firefly's configuration, from the E2 seed in a scratch database (as B3)
docker exec $SHARED sh -c "createdb -U supabase_admin $SRC_DB && pg_dump -U supabase_admin postgres | psql -U supabase_admin -q $SRC_DB" > "$T/source-clone.log" 2>&1 || die "source clone"
psql "$SRC_URL" -q -c "INSERT INTO public.orgs (id, name, slug) VALUES ('$FIREFLY_STAGING_ORG', 'Firefly Early Learning', 'firefly-early-learning') ON CONFLICT (id) DO NOTHING;"
(cd "$CWT/web" && FIREFLY_STAGING_SEED_DATABASE_URL=$SRC_URL npm run -s staging:seed:firefly -- apply --target local) > "$EV/source-seed-apply.txt" 2>&1
echo "export source: E2 seed apply rc=$? ($(grep -c '^ *PASS' "$EV/source-seed-apply.txt") PASS, $(grep -c '^ *FAIL' "$EV/source-seed-apply.txt") FAIL)"
t0
(cd "$CWT/web" && TENANT_CONFIG_EXPORT_DATABASE_URL=$SRC_URL npm run -s tenant:config:export -- --target local --org-id $FIREFLY_STAGING_ORG --keep-seed-config --out "$D/firefly-config-export.json") > "$EV/step6-export.txt" 2>&1 || die "export"
EXPORT_SHA=$(shasum -a 256 "$D/firefly-config-export.json" | cut -d' ' -f1)
echo "step-6 export: $(grep 'items:' "$EV/step6-export.txt" | sed 's/^ *//') sha256 $EXPORT_SHA"
t1 "6 export (part of step 6)" "before the window" 0 "$(grep 'items:' "$EV/step6-export.txt" | sed 's/^ *items: //')"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 5: release directory and config copy"
t0
$REL first-promotion-config --new-ref $NEW_REF --out "$D/release-config.json" > "$EV/step5-config.json"; RC=$?
C="--config $D/release-config.json"
t1 "5 config copy" "before the window" 0 "rc=$RC"
[ $RC -eq 0 ] || die "config copy"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 7 (T+0:00): go/no-go observations, plan, prepare, runbook"
t0
$REL identify "${REFS[@]}" > "$D/identify.json" || die "identify at step 7"
$REL emit-sql ledger | STGDB -At -X -f - > "$D/staging-ledger.txt"
$REL emit-sql fingerprint | STGDB -At -X -f - > "$D/staging-fingerprint.txt"
{ node -e 'const c=require(process.argv[1]); for (const o of [c.tenancy.staging_school, ...c.tenancy.qa_fixture_orgs]) console.log(`${o.id}|active|${o.name}`); for (const o of c.tenancy.staging_retired_orgs) console.log(`${o.id}|retired|${o.name}`)' "$CWT/scripts/release/release-config.json"
  $REL emit-sql orgs | STGDB -At -X -f -; } > "$D/staging-orgs.txt"
node -e 'const c=require(process.argv[1]); process.stdout.write(JSON.stringify({check_runs: c.required_checks.map((name)=>({name, head_sha: process.argv[2], status:"completed", conclusion:"success"}))}))' "$CWT/scripts/release/release-config.json" "$CAND" > "$D/check-runs.json"   # stub: CI green (M6 is real only at step 4)
printf '{"gitSha":"%s","gitBranch":"staging","vercelEnv":"preview","supabaseProjectRef":"ikaxilmwmrmbagoidedu"}\n' "$STAGING" > "$D/staging-build-info.json"
printf '{"gitSha":"%s","gitBranch":"main","vercelEnv":"production","supabaseProjectRef":"%s"}\n' "$MAIN" "$OLD_REF" > "$D/production-build-info.json"
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/production-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/production-fingerprint.txt"
echo "new project before: ledger rows $(grep -c . "$D/production-ledger.txt"), fingerprint $(tr '\n' ' ' < "$D/production-fingerprint.txt")"
$REL plan --first-promotion "${REFS[@]}" --production-ledger "$D/production-ledger.txt" > "$D/plan.json" || die "plan"
$REL prepare --first-promotion $C "${REFS[@]}" --environment rehearsal --out-dir "$D" \
  --staging-build-info "$D/staging-build-info.json" --check-runs "$D/check-runs.json" \
  --staging-ledger "$D/staging-ledger.txt" --staging-fingerprint "$D/staging-fingerprint.txt" --staging-orgs "$D/staging-orgs.txt" \
  --production-build-info "$D/production-build-info.json" --production-ledger "$D/production-ledger.txt" \
  --production-fingerprint "$D/production-fingerprint.txt" > "$EV/step7-prepare.json"; RC=$?
cat "$EV/step7-prepare.json" | head -30
[ $RC -eq 0 ] || die "prepare exit $RC: no-go"
M="--manifest $D/manifest.json"
$REL runbook $M $C > "$D/runbook.txt" || die "runbook"
SHA=$(node -e 'import("'"$CWT"'/scripts/release/release-lib.mjs").then(l=>process.stdout.write(l.hashRecord(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")))))' "$D/manifest.json")
t1 "7 go/no-go, identify, staging verify, prepare" "T+0:00–0:25" 1500 "prepare exit 0, manifest ${SHA:0:12}"

echo "## step 8 (T+0:25): owner approval"
t0
$REL approve $M $C --approver Kelly --confirm "${SHA:0:12}" --ttl-hours 4 > "$EV/step8-approve.json"; RC=$?
A="--audit $D/audit.jsonl $M --approval $D/approval.json"
$REL record $C $A --step owner.approval --status pass --detail '{}' > /dev/null || die "record owner.approval"
t1 "8 owner approval" "T+0:25–0:30" 300 "approve rc=$RC (rehearsal environment; production approve needs the owner's terminal)"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 9 (T+0:30): schema apply on the new project, then the census"
t0
eval "$(grep '^fp_target()' "$D/runbook.txt")"
fp_target "postgresql://postgres:x@db.$NEW_REF.supabase.co:5432/postgres" && ! fp_target "postgresql://postgres:x@db.$OLD_REF.supabase.co:5432/postgres" >/dev/null && echo "fp_target: accepts the new ref, refuses the old"
docker exec $N pg_dump -U postgres -Fc --no-owner -d postgres -f /tmp/pre-chain-empty.dump && DUMP=$(docker exec $N sha256sum /tmp/pre-chain-empty.dump | cut -d' ' -f1)
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/before-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/before-fingerprint.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$D/before-orgs.txt" 2>/dev/null
$REL record $C $A --step production.snapshot --status pass --detail "{\"dump_sha256\":\"$DUMP\",\"rollback_target\":\"$OLD_REF\"}" > /dev/null || die "record snapshot"
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/pre-chain-ledger.txt"
$REL check-ledger $C $M --ledger "$D/pre-chain-ledger.txt" > "$EV/step9-check-ledger.json" || die "check-ledger"
$REL emit-sql ledger-table | NEWDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - || die "ledger-table"
CH0=$(date +%s); : > "$EV/step9-apply.log"
for v in $($REL apply-order $M); do
  ( set -o pipefail; $REL emit-apply $M --version "$v" | NEWDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - > /dev/null 2>"$T/apply-stderr.txt" ); rc=$?
  echo "$rc $v" >> "$EV/step9-apply.log"
  [ $rc -ne 0 ] && { grep -v NOTICE "$T/apply-stderr.txt" | tail -20; die "STOPPED at $v"; }
  $REL record $C $A --step schema.expand --status applied --detail "{\"version\":\"$v\"}" > /dev/null || die "record refused at $v"
done
CHAIN_S=$(( $(date +%s) - CH0 ))
echo "chain: $(grep -c '^0 ' "$EV/step9-apply.log") of $($REL apply-order $M | wc -l | tr -d ' ') applied in ${CHAIN_S}s"
$REL emit-sql ledger | NEWDB -At -X -f - > "$D/census-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/census-fingerprint.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$D/census-orgs.txt"
$REL emit-sql census | NEWDB -At -X -f - > "$D/census-extras.txt"
$REL check-production $C $M --stage schema --ledger "$D/census-ledger.txt" --fingerprint "$D/census-fingerprint.txt" --orgs "$D/census-orgs.txt" --census "$D/census-extras.txt" > "$EV/step9-check-schema.json"; RC=$?
diff -q "$D/staging-fingerprint.txt" "$D/census-fingerprint.txt" >/dev/null && echo "fingerprint: new project == staging stand-in" || echo "fingerprint: DIFFERS"
echo "census orgs: $(tr '\n' ' ' < "$D/census-orgs.txt")"
[ $RC -eq 0 ] || die "census failed: hold"
$REL record $C $A --step schema.expand --status pass --detail '{}' > /dev/null
t1 "9 schema apply + census" "T+0:30–1:30" 3600 "$(grep -c '^0 ' "$EV/step9-apply.log") files in ${CHAIN_S}s; check-production --stage schema exit 0"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 10 (T+1:30): platform settings — dashboard only; here the harness environment stands in for them"
t1_10() { printf '%s\t%s\t%s\t%s\t%s\n' "10 platform settings" "T+1:30–1:45" 900 "-" "not simulated: Supabase/Vercel/Render dashboards (owner)" >> "$TS"; }; t1_10

echo "## step 11 (T+1:45): serve the candidate on the new ref (harness), poll build-info as the runbook does"
t0
docker run -d --name alloy-b4-rest --network $BR -p 127.0.0.1::3000 "${LBL[@]}" \
  -e "PGRST_DB_URI=postgres://authenticator:$PW@$N:5432/postgres" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=$JWT_SECRET -e PGRST_DB_USE_LEGACY_GUCS=false $REST >/dev/null || die "rest"
docker network connect $INT alloy-b4-rest || die "rest net"
docker run -d --name alloy-b4-auth --network $BR -p 127.0.0.1::9999 "${LBL[@]}" --entrypoint auth \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 \
  -e GOTRUE_DB_DRIVER=postgres -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$N:5432/postgres" \
  -e GOTRUE_JWT_SECRET=$JWT_SECRET -e GOTRUE_JWT_AUD=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=true $AUTH serve >/dev/null || die "auth"
docker network connect $INT alloy-b4-auth || die "auth net"
RESTP=$(docker port alloy-b4-rest 3000/tcp | head -1 | sed 's/.*://'); AUTHP=$(docker port alloy-b4-auth 9999/tcp | head -1 | sed 's/.*://')
for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$RESTP/" >/dev/null && curl -sf "http://127.0.0.1:$AUTHP/health" >/dev/null && break; sleep 1; done
node "$REPO/docs/platform/runtime/environments-b3-tenant-evidence-2026-11-25/api-proxy.mjs" "$RESTP" "$AUTHP" "$T/proxy.port" & PROXY_PID=$!
for i in $(seq 1 20); do [ -s "$T/proxy.port" ] && break; sleep 0.5; done
API=http://127.0.0.1:$(cat "$T/proxy.port")
SERVICE_KEY=$(node -e 'const c=require("crypto");const b=o=>Buffer.from(JSON.stringify(o)).toString("base64url");const h=b({alg:"HS256",typ:"JWT"}),p=b({role:"service_role",iss:"supabase",iat:1764000000,exp:2000000000});console.log(h+"."+p+"."+c.createHmac("sha256",process.argv[1]).update(h+"."+p).digest("base64url"))' "$JWT_SECRET")
: > "$EV/harness-requests.jsonl"
harness() {  # <sha> <branch> <supabase-ref> <port|0>   — a deployment of <sha> wired to <ref>; CRON_SECRET unset
  [ -n "${HPID:-}" ] && { kill "$HPID" 2>/dev/null; pkill -f b4-route-harness 2>/dev/null; wait "$HPID" 2>/dev/null; sleep 1; }
  rm -f "$T/harness.port"
  (cd "$CWT/web" && env -i PATH="$PATH" HOME="$HOME" NODE_ENV=production ALLOY_ENVIRONMENT=production \
    VERCEL_ENV=production VERCEL_GIT_COMMIT_SHA="$1" VERCEL_GIT_COMMIT_REF="$2" VERCEL_GIT_COMMIT_MESSAGE="b4 rehearsal" \
    NEXT_PUBLIC_SUPABASE_URL="https://$3.supabase.co" SUPABASE_URL="$API" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
    INTERNAL_CRON_TOKEN="$CRON_TOKEN" ./node_modules/.bin/tsx --tsconfig tsconfig.json scripts/b4-route-harness.ts "$4" "$T/harness.port" "$EV/harness-requests.jsonl") >> "$T/harness.log" 2>&1 &
  HPID=$!
  for i in $(seq 1 120); do [ -s "$T/harness.port" ] && break; sleep 0.5; done
  [ -s "$T/harness.port" ] || { tail -20 "$T/harness.log"; die "harness did not start"; }
  HP=$(cat "$T/harness.port"); ORIGIN=http://127.0.0.1:$HP
}
harness "$CAND" main $NEW_REF 0
echo "harness (candidate on $NEW_REF): $ORIGIN; rest 127.0.0.1:$RESTP auth 127.0.0.1:$AUTHP api $API"
# the runbook's poll, against the harness origin
n=0; until b=$(curl -fsS "$ORIGIN/api/build-info") && echo "$b" | grep -q "\"gitSha\":\"$CAND\"" && echo "$b" | grep -q "\"supabaseProjectRef\":\"$NEW_REF\""; do n=$((n+1)); [ $n -gt 20 ] && die "build-info never served the candidate"; sleep 1; done
echo "$b" > "$D/after-build-info.json"; echo "build-info: $b"
$REL record $C $A --step code.deploy --status pass --detail "{\"main\":\"$CAND\",\"simulated\":\"route-harness\"}" > /dev/null || die "record code.deploy"
t1 "11 release (deploy simulated)" "T+1:45–2:00" 900 "build-info serves the candidate on the new ref"

# ════════════════════════════════════════════════════════════════════════════
echo "## steps 12–14: the clock (pg_cron + pg_net), with the relay as the production origin"
docker run -d --name alloy-b4-relay --network $BR "${LBL[@]}" --entrypoint node $STORAGE -e \
  "const net=require('net');net.createServer(c=>{const u=net.connect($HP,'host.docker.internal');c.pipe(u);u.pipe(c);u.on('error',()=>c.destroy());c.on('error',()=>u.destroy())}).listen(8080)" >/dev/null || die "relay"
docker network connect --alias wake-relay $INT alloy-b4-relay || die "relay net"
WAKE_URL=http://wake-relay:8080/api/scheduled-work/wake
echo "N networks: [$(docker inspect $N --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')] (internal: $(docker network inspect $INT --format '{{.Internal}}'))"
q1 "select jobname||' '||schedule||' active='||active from cron.job" | tee "$EV/clock-job.txt"
CLOCK_SQL="select coalesce(wake_count,0)||'|'||coalesce(last_wake_at::text,'-') from public.scheduled_work_clock where id='singleton'"
RESP_SQL="select count(*) from net._http_response"
QUEUE_SQL="select count(*) from net.http_request_queue"
URL_SQL="select coalesce((select s.decrypted_secret from vault.decrypted_secrets s where s.name = 'scheduled_work_wake_url'), 'https://staging.workwithalloy.com/api/scheduled-work/wake')"
{
  echo "before step 12: the job's target resolves to: $(q1 "$URL_SQL")"
  echo "before step 12: credential rows: $(q1 "select count(*) from vault.decrypted_secrets where name='scheduled_work_wake_credential'")"
  B4Q=$(q1 "$QUEUE_SQL"); B4R=$(q1 "$RESP_SQL")
  NEWDB -qAtX -c "do \$\$ begin execute (select command from cron.job where jobname='scheduled-work-clock'); end \$\$;"
  echo "before step 12: one tick by hand (the job's own command): requests queued $B4Q -> $(q1 "$QUEUE_SQL"), responses $B4R -> $(q1 "$RESP_SQL") (inert while the credential is absent)"
} | tee "$EV/clock-before.txt"

t0
q1 "select vault.create_secret('$WAKE_URL', 'scheduled_work_wake_url', 'B4 rehearsal: production origin stand-in')" > /dev/null || die "vault url"
RB_URL=$(q1 "$URL_SQL"); echo "step 12 read-back: $RB_URL" | tee -a "$EV/clock-steps.txt"
[ "$RB_URL" = "$WAKE_URL" ] || die "step 12 read-back"
t1 "12 Vault wake URL" "T+2:00–2:03" 180 "reads back as the production-origin stand-in"
t0
q1 "select vault.create_secret('$CRON_TOKEN', 'scheduled_work_wake_credential', 'B4 rehearsal: production INTERNAL_CRON_TOKEN stand-in')" > /dev/null || die "vault credential"
echo "step 13: credential rows: $(q1 "select count(*) from vault.decrypted_secrets where name='scheduled_work_wake_credential'")" | tee -a "$EV/clock-steps.txt"
t1 "13 Vault wake credential" "T+2:03–2:05" 120 "present"

echo "## step 14 (T+2:05): observe a real pg_cron tick (*/5) — up to ten minutes allowed"
t0
CLK0=$(q1 "$CLOCK_SQL"); W0=${CLK0%%|*}; W0=${W0:-0}; R0=$(q1 "$RESP_SQL")
echo "clock before: wake_count=${W0} responses=$R0 (UTC now $(date -u +%H:%M:%S))" | tee -a "$EV/clock-steps.txt"
for i in $(seq 1 66); do
  CLK=$(q1 "$CLOCK_SQL"); W=${CLK%%|*}; [ -n "$W" ] && [ "$W" -gt "$W0" ] && break; sleep 10
done
TICK_S=$(( $(date +%s) - T0 ))
{
  echo "clock after: wake_count|last_wake_at = $(q1 "$CLOCK_SQL") (waited ${TICK_S}s)"
  echo "net._http_response (newest): $(q1 "select status_code||' '||coalesce(error_msg,'-')||' '||left(content,120) from net._http_response order by id desc limit 1")"
  echo "cron.job_run_details (newest): $(q1 "select status||' '||start_time::text from cron.job_run_details order by runid desc limit 1")"
  echo "harness saw: $(grep '/api/scheduled-work/wake' "$EV/harness-requests.jsonl" | tail -1)"
  echo "no staging target: every response is the production stand-in's route (non-2xx responses: $(q1 "select count(*) from net._http_response where status_code is null or status_code not between 200 and 299"))"
} | tee -a "$EV/clock-steps.txt"
# Vercel Cron, once main carries web/vercel.json: Bearer $CRON_SECRET only if set. Production leaves it unset.
{
  echo "vercel-cron GET, no Authorization (CRON_SECRET unset, so Vercel sends none): HTTP $(curl -s -o /dev/null -w '%{http_code}' "$ORIGIN/api/scheduled-work/wake")"
  echo "vercel-cron GET, Authorization: Bearer <any> with CRON_SECRET unset: HTTP $(curl -s -o /dev/null -w '%{http_code}' -H 'Authorization: Bearer some-value' "$ORIGIN/api/scheduled-work/wake")"
  echo "POST, x-cron-token wrong: HTTP $(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'x-cron-token: wrong' "$ORIGIN/api/scheduled-work/wake")"
  echo "clock unchanged by the refused calls: $(q1 "$CLOCK_SQL")"
} | tee "$EV/vercel-cron-refusals.txt"
W1=$(q1 "$CLOCK_SQL"); W1=${W1%%|*}
[ -n "$W1" ] && [ "$W1" -gt "$W0" ] || die "step 14: no tick within the wait (rollback trigger 4)"
t1 "14 observe the clock" "T+2:05–2:10" 600 "real tick after ${TICK_S}s; wake_count $W0 -> $W1; Vercel-Cron-shaped calls 401"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 15 (T+2:10): production verification (§8, the parts with no hosted service)"
t0
curl -fsS "$ORIGIN/api/build-info" > "$D/after-build-info.json"
(cd "$CWT/backend" && env -i PATH="$PATH" HOME="$HOME" ALLOY_ENVIRONMENT=production RENDER_GIT_COMMIT="$CAND" RENDER_GIT_BRANCH=main SUPABASE_URL="$API" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_KEY" \
  "$REPO/backend/.venv/bin/python" "$HERE/backend-build-info.py") > "$D/after-backend-build-info.json" 2> "$T/backend.log"; BRC=$?
echo "backend /build-info rc=$BRC: $(cat "$D/after-backend-build-info.json")"
$REL emit-sql ledger | NEWDB -At -X -f - > "$D/after-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/after-fingerprint.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$D/after-orgs.txt"
$REL check-production $C $M --build-info "$D/after-build-info.json" --ledger "$D/after-ledger.txt" --fingerprint "$D/after-fingerprint.txt" --orgs "$D/after-orgs.txt" --stage final > "$EV/step15-check-production-final.json"; RC=$?
cat "$EV/step15-check-production-final.json"
{
  echo "| §8 check | local result |"
  echo "|---|---|"
  echo "| Vercel /api/build-info | $(node -e 'const b=require(process.argv[1]);console.log(b.gitSha===process.argv[2]&&b.gitBranch==="main"&&b.vercelEnv==="production"&&b.supabaseProjectRef===process.argv[3]?"PASS (route handler, simulated Vercel env)":"FAIL "+JSON.stringify(b))' "$D/after-build-info.json" "$CAND" "$NEW_REF") |"
  echo "| Render /build-info | $(node -e 'const j=require(process.argv[1]);console.log(j.status===200&&j.body.git_commit===process.argv[2]?"PASS (build_info handler, simulated RENDER_GIT_*)":"FAIL "+JSON.stringify(j))' "$D/after-backend-build-info.json" "$CAND") |"
  echo "| check-production --stage final | $([ $RC -eq 0 ] && echo PASS || echo "FAIL rc=$RC") |"
  echo "| Orgs | $( [ "$(wc -l < "$D/after-orgs.txt" | tr -d ' ')" = 1 ] && grep -q '|retired|_w17_selftest_' "$D/after-orgs.txt" && echo "PASS: $(cat "$D/after-orgs.txt")" || echo "FAIL: $(tr '\n' ' ' < "$D/after-orgs.txt")") |"
  echo "| Clock | PASS: step 14 tick; CRON_SECRET absent from the harness environment |"
  echo "| Settings I-2, I-3, I-10, I-11, I-13 | not local: dashboard re-read (owner) |"
  echo "| /login renders | not local: needs the deployed app |"
  echo "| Old project unchanged | not local: nothing in this rehearsal can reach it |"
} | tee "$EV/step15-post-checks.txt"
[ $RC -eq 0 ] && [ $BRC -eq 0 ] || die "step 15 failed: roll back (§7)"
$REL record $C $A --step production.verify --status pass --detail '{}' > /dev/null
cp "$D/audit.jsonl" "$T/audit-after-step15.jsonl"
t1 "15 production verification" "T+2:10–2:20" 600 "check-production --stage final exit 0; build-info and backend build-info on the candidate"
echo "T+2:20 decision: KEEP (every local §8 row passed)"
# Step 16's baseline is taken here, after the first clock tick, not at step 9: the tick ran the chain's one-time
# clock_activation_certification work (P4 F8) and wrote its attempt and occurrence. The first dress rehearsal used
# the step-9 census and step 16 failed census_write_set on exactly those two rows (b4-first-run-step16-verify.txt).
$REL emit-sql census | NEWDB -At -X -f - > "$D/census-before-step16.txt"
diff "$D/census-extras.txt" "$D/census-before-step16.txt" > "$D/census-step9-to-before-step16.diff"
echo "census, step 9 → before step 16 (must be the clock's rows only): $(grep '^>' "$D/census-step9-to-before-step16.diff" | sed 's/^> //' | tr '\n' ' ')"
[ -z "$(grep '^>' "$D/census-step9-to-before-step16.diff" | grep -v -E '^> rows:(scheduled_work_attempts|scheduled_work_occurrences|scheduled_work_clock)\|')" ] || die "something other than the clock wrote between step 9 and step 16"

# ════════════════════════════════════════════════════════════════════════════
echo "## step 16 (T+2:25): Firefly — helper, import, checks (one recorded step)"
t0
export ALLOY_OPERATOR_SERVICE_ROLE_KEY=$SERVICE_KEY
ADM=$(curl -s -X POST "$API/auth/v1/admin/users" -H "Authorization: Bearer $SERVICE_KEY" -H "apikey: $SERVICE_KEY" -H 'content-type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"email_confirm\":true}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id??""))')
echo "16.1 admin auth user (dashboard action; here the Auth admin API): $ADM"; [ -n "$ADM" ] || die "16.1"
TG=(--target local --supabase-url "$API")
AA=(--name "Firefly Early Learning" --slug firefly-early-learning --industry childcare --admin-user-id "$ADM" --admin-email "$ADMIN_EMAIL" --admin-full-name "Firefly Admin (B4 rehearsal)")
tc() { (cd "$CWT/web" && npm run -s tenant:create -- "$@"); }
ti() { (cd "$CWT/web" && npm run -s tenant:config:import -- "$@"); }
tc "${TG[@]}" "${AA[@]}" --log "$D/step16-tenant-create.log" --dry-run > "$EV/step16-2-create-dry-run.txt" 2>&1 || die "16.2"
grep -E '^orgs now|\|retired\||^dry run' "$EV/step16-2-create-dry-run.txt"
echo "firefly-early-learning" | tc "${TG[@]}" "${AA[@]}" --log "$D/step16-tenant-create.log" > "$EV/step16-3-create.txt" 2>&1 || die "16.3"
ORG=$(sed -n 's/^ORG_ID=//p' "$EV/step16-3-create.txt"); echo "16.3 created org $ORG"; [ -n "$ORG" ] || die "16.3 no ORG_ID"
I=("${TG[@]}" --org-id "$ORG" --admin-user-id "$ADM" --file "$D/firefly-config-export.json" --expect-sha256 "$EXPORT_SHA")
ti plan "${I[@]}" --log "$D/step16-import.log" > "$EV/step16-4-import-plan.txt" 2>&1 || die "16.4"
grep '^summary' "$EV/step16-4-import-plan.txt"
echo "${ORG:0:8}" | ti apply "${I[@]}" --log "$D/step16-import.log" > "$EV/step16-5-import-apply.txt" 2>&1 || die "16.5"
tail -1 "$EV/step16-5-import-apply.txt"
$REL emit-sql census | NEWDB -At -X -f - > "$D/after-step16-census-extras.txt"
ti verify "${I[@]}" --log "$D/step16-verify.log" --baseline "$D/census-before-step16.txt" --after-census "$D/after-step16-census-extras.txt" --release-config "$D/release-config.json" > "$EV/step16-6-verify.txt" 2>&1; RC=$?
grep -E '^(PASS|FAIL)|✓|✗' "$EV/step16-6-verify.txt" | cut -c1-150
$REL emit-sql orgs | NEWDB -At -X -f - > "$D/after-step16-orgs.txt"
echo "orgs after step 16: $(tr '\n' ' ' < "$D/after-step16-orgs.txt")"
[ $RC -eq 0 ] || die "step 16 verify failed: 16.R"
t1 "16 Firefly: helper + import + checks" "T+2:25–2:50" 1500 "verify exit 0 ($(grep -c '^PASS' "$EV/step16-6-verify.txt") PASS)"

echo "## step 17 (T+2:50): record"
t0
DESTR=$(node -e 'process.stdout.write(String(require(process.argv[1]).migrations.destructive_in_chain.length))' "$D/manifest.json")
$REL record $C $A --step schema.contract --status skip --detail "{\"reason\":\"first promotion: destructive files ran in version order at schema.expand\",\"destructive_in_chain\":$DESTR}" > /dev/null
$REL record $C $A --step release.record --status pass --detail '{}' > /dev/null
$REL verify-audit "$D/audit.jsonl" > "$EV/step17-verify-audit.json"; RC=$?
cat "$EV/step17-verify-audit.json"
t1 "17 record + verify-audit" "T+2:50–3:00" 600 "verify-audit rc=$RC"

# ════════════════════════════════════════════════════════════════════════════
echo "## §7 rollback rehearsal"
R=$EV/rollback
echo "### R1 step 16 fails its checks → 16.R (production stays verified, no tenant)"
t0
RBSQL() { (cd "$CWT/web" && npm run -s tenant:rollback-sql) | NEWDB -X "$@" -f -; }
NEWDB -qAtX -c "insert into public.customers (org_id, name) values ('$ORG', 'B4 window-closed probe')"
RBSQL -v org_id="$ORG" -v "org_name=Firefly Early Learning" > "$R/R1-refused-window-closed.txt" 2>&1; echo "16.R with a customer row present rc=$? (expected non-zero): $(grep -m1 ERROR "$R/R1-refused-window-closed.txt")"
NEWDB -qAtX -c "delete from public.customers where org_id = '$ORG'"
RBSQL -v org_id="$ORG" -v "org_name=Firefly Early Learning" > "$R/R1-rollback.txt" 2>&1; RC=$?
echo "16.R rollback rc=$RC: $(grep -m1 -E 'removed org|ERROR' "$R/R1-rollback.txt" | sed -E 's/^.*(NOTICE|ERROR): *//')"
$REL emit-sql census | NEWDB -At -X -f - > "$R/R1-after-rollback-census-extras.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$R/R1-after-rollback-orgs.txt"
diff "$D/census-before-step16.txt" "$R/R1-after-rollback-census-extras.txt" > "$R/R1-census-diff.txt" && echo "census equals the pre-step-16 baseline" || echo "CENSUS DIFFERS: $(grep -c '^[<>]' "$R/R1-census-diff.txt") line(s)"
diff "$D/census-orgs.txt" "$R/R1-after-rollback-orgs.txt" > /dev/null && echo "orgs equal step 9"  || echo "ORGS DIFFER"
t1 "R1 16.R removal + proof" "inside T+2:25–2:50" 1500 "rc=$RC"

echo "### R1b after 16.R: step 16 again from 16.2, same Auth user, same baseline (the cause fixed, time allowing)"
t0
tc "${TG[@]}" "${AA[@]}" --log "$R/R1b-tenant-create.log" --dry-run > "$R/R1b-2-create-dry-run.txt" 2>&1 || die "R1b 16.2"
grep -E '^orgs now|\|retired\||^dry run' "$R/R1b-2-create-dry-run.txt"
echo "firefly-early-learning" | tc "${TG[@]}" "${AA[@]}" --log "$R/R1b-tenant-create.log" > "$R/R1b-3-create.txt" 2>&1 || die "R1b 16.3"
ORG2=$(sed -n 's/^ORG_ID=//p' "$R/R1b-3-create.txt"); echo "R1b 16.3 created org $ORG2 (first run's was $ORG)"; [ -n "$ORG2" ] || die "R1b no ORG_ID"
I2=("${TG[@]}" --org-id "$ORG2" --admin-user-id "$ADM" --file "$D/firefly-config-export.json" --expect-sha256 "$EXPORT_SHA")
ti plan "${I2[@]}" --log "$R/R1b-import.log" > "$R/R1b-4-import-plan.txt" 2>&1 || die "R1b 16.4"
grep '^summary' "$R/R1b-4-import-plan.txt"
echo "${ORG2:0:8}" | ti apply "${I2[@]}" --log "$R/R1b-import.log" > "$R/R1b-5-import-apply.txt" 2>&1 || die "R1b 16.5"
tail -1 "$R/R1b-5-import-apply.txt"
$REL emit-sql census | NEWDB -At -X -f - > "$R/R1b-after-census-extras.txt"
ti verify "${I2[@]}" --log "$R/R1b-verify.log" --baseline "$D/census-before-step16.txt" --after-census "$R/R1b-after-census-extras.txt" --release-config "$D/release-config.json" > "$R/R1b-6-verify.txt" 2>&1; RC=$?
grep -E '^(PASS|FAIL)|✓|✗' "$R/R1b-6-verify.txt" | cut -c1-150
$REL emit-sql orgs | NEWDB -At -X -f - > "$R/R1b-after-orgs.txt"
echo "orgs after the re-run: $(tr '\n' ' ' < "$R/R1b-after-orgs.txt")"
t1 "R1b step 16 re-run after 16.R" "inside T+2:25–2:50" 1500 "verify rc=$RC ($(grep -c '^PASS' "$R/R1b-6-verify.txt") PASS)"

echo "### R2 T+2:20 roll back: clock first, then code (Vercel Instant Rollback simulated), audit"
t0
q1 "delete from vault.secrets where name = 'scheduled_work_wake_credential'" > /dev/null
echo "credential rows after delete: $(q1 "select count(*) from vault.decrypted_secrets where name='scheduled_work_wake_credential'")" | tee "$R/R2-clock.txt"
B4Q=$(q1 "$QUEUE_SQL"); B4R=$(q1 "$RESP_SQL")
NEWDB -qAtX -c "do \$\$ begin execute (select command from cron.job where jobname='scheduled-work-clock'); end \$\$;"
echo "a tick by hand after the delete: queued $B4Q -> $(q1 "$QUEUE_SQL"), responses $B4R -> $(q1 "$RESP_SQL")" | tee -a "$R/R2-clock.txt"
harness "$MAIN" main $OLD_REF "$HP"    # the old deployment, inlined to the old project, on the same origin
n=0; until b=$(curl -fsS "$ORIGIN/api/build-info") && echo "$b" | grep -q "\"gitSha\":\"$MAIN\"" && echo "$b" | grep -q "\"supabaseProjectRef\":\"$OLD_REF\""; do n=$((n+1)); [ $n -gt 20 ] && die "rollback build-info"; sleep 1; done
echo "$b" > "$R/R2-rollback-build-info.json"; echo "after Instant Rollback (simulated) build-info: $b" | tee -a "$R/R2-clock.txt"
cp "$T/audit-after-step15.jsonl" "$R/R2-audit.jsonl"
RA="--audit $R/R2-audit.jsonl $M --approval $D/approval.json"
$REL record $C $RA --step production.verify --status fail --detail '{"rehearsal":"T+2:20 roll-back branch"}' > /dev/null
$REL record $C $RA --step code.rollback --status pass --detail "{\"served\":\"$MAIN\",\"supabase_project_ref\":\"$OLD_REF\"}" > /dev/null; echo "record code.rollback rc=$?"
$REL verify-audit "$R/R2-audit.jsonl" > "$R/R2-verify-audit.json"; echo "verify-audit (roll-back branch) rc=$?"
t1 "R2 roll back: clock + code + record" "T+2:20 onward" 0 "credential deleted, job inert; build-info on old main/old ref"
echo "waiting for the next real pg_cron tick to show the clock stays silent"
t0
W2=$(q1 "$CLOCK_SQL"); W2=${W2%%|*}; R2=$(q1 "$RESP_SQL"); RUNS0=$(q1 "select count(*) from cron.job_run_details")
for i in $(seq 1 40); do [ "$(q1 "select count(*) from cron.job_run_details")" -gt "$RUNS0" ] && break; sleep 10; done
sleep 5
echo "after the next tick: cron runs $RUNS0 -> $(q1 "select count(*) from cron.job_run_details"), wake_count $W2 -> $(q1 "$CLOCK_SQL" | cut -d'|' -f1), responses $R2 -> $(q1 "$RESP_SQL")" | tee -a "$R/R2-clock.txt"
t1 "R2b next tick is silent" "-" 0 "see rollback/R2-clock.txt"

echo "### R3 step 9 fails mid-chain → hold; what can be retried"
t0
docker network create --internal "${LBL[@]}" $FNET >/dev/null
boot $F $FNET failpath
docker network disconnect $FNET $F
$REL emit-sql ledger-table | FDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - || die "F ledger-table"
$REL apply-order $M > "$T/apply-order.txt"   # read from a file: closing the tool's stdout early (head) is an EPIPE
k=0; for v in $(head -40 "$T/apply-order.txt"); do
  ( set -o pipefail; $REL emit-apply $M --version "$v" | FDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - > /dev/null 2>&1 ) && k=$((k+1))
done
V41=$(sed -n 41p "$T/apply-order.txt")
TB=$(FDB -AtX -c "select count(*) from pg_tables where schemaname='public'")
( set -o pipefail; { $REL emit-apply $M --version "$V41"; echo "select 1/0; -- B4: an injected failure inside file $V41's transaction"; } | FDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - > "$R/R3-failed-file.txt" 2>&1 ); RC=$?
{
  echo "applied $k files, then $V41 with an injected error: rc=$RC ($(grep -m1 ERROR "$R/R3-failed-file.txt"))"
  echo "ledger rows after the failure: $(FDB -AtX -c 'select count(*) from supabase_migrations.schema_migrations') (the failing file recorded nothing); public tables $TB -> $(FDB -AtX -c "select count(*) from pg_tables where schemaname='public'")"
} | tee "$R/R3-failpath.txt"
$REL emit-sql ledger-if-present | FDB -At -X -q -f - > "$R/R3-partial-ledger.txt"
$REL check-ledger $C $M --ledger "$R/R3-partial-ledger.txt" > "$R/R3-check-ledger-partial.json" 2>&1; echo "check-ledger on the partly built project rc=$? (resume refused)" | tee -a "$R/R3-failpath.txt"
$REL plan --first-promotion "${REFS[@]}" --production-ledger "$R/R3-partial-ledger.txt" > "$R/R3-plan-partial.json" 2>&1; echo "plan --first-promotion (a fixed-forward candidate) over it rc=$? ($(node -e 'try{const j=require(process.argv[1]);console.log((j.blockers||j.plan?.blockers||[]).join("; ").slice(0,140))}catch{console.log("-")}' "$R/R3-plan-partial.json"))" | tee -a "$R/R3-failpath.txt"
t1 "R3 step-9 failure path" "T+0:30–1:30" 0 "partial project cannot be resumed or re-planned: recreate it"

echo "## timings"; column -t -s $'\t' "$TS"

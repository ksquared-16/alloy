#!/bin/bash
# B2 (M3, M4): the release tool's first-promotion mode, end to end, over the full chain of a simulated rebuilt
# candidate, on throwaway Supabase Postgres. Every release-tool step is the CLI command the first-promotion
# runbook prints; only the database target differs (`docker exec … psql` instead of "$PRODUCTION_DB_URL").
#
# Isolation as P4's rehearse.sh and B1's w17-retirement-test.sh: local images only, tmpfs data, no host ports,
# no mounts; the only network ever attached is an --internal one for the GoTrue and Storage migrators,
# removed before any migration runs. Not the shared alloy-cert stack; no supabase CLI; no hosted service.
#
#   N  the "new project": platform schemas only, then the tool's first-promotion path (empty ledger, whole chain)
#   S  the staging stand-in: the same chain applied as staging's normal path did (P4 step 4), to observe
#      staging's ledger and fingerprint
#
# The candidate is simulated offline (no fetch): the step-1 merge of this branch into origin/staging, then
# P4's build-candidate.sh over it and origin/main. Identities and dates are pinned, so the SHAs reproduce.
#
# Usage: first-promotion-rehearsal.sh <evidence-dir>
set -u
EV=$1; mkdir -p "$EV"; EV=$(cd "$EV" && pwd)
REPO=$(git rev-parse --show-toplevel)
REL="node $REPO/scripts/release/alloy-release.mjs"
PG=public.ecr.aws/supabase/postgres:17.6.1.165
AUTH=public.ecr.aws/supabase/gotrue:v2.196.0
STORAGE=public.ecr.aws/supabase/storage-api:v1.70.3
PW=b2-throwaway   # local-only role password inside a network-less container that is destroyed afterwards
LBL=(--label alloy.objective=WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66 --label alloy.purpose=b2-first-promotion-throwaway)
NEW_REF=rehearsalnewprojectr   # invented; a real window uses the new project's ref (briefing step 5)
D=$EV/release                  # the release directory, as releases/<date>-<sha12>/ would be
rm -rf "$D" /tmp/alloy-b2-fp; mkdir -p "$D" /tmp/alloy-b2-fp

cleanup() {
  docker rm -f alloy-b2-fp-new alloy-b2-fp-staging >/dev/null 2>&1
  for n in alloy-b2-fp-new-net alloy-b2-fp-staging-net; do docker network rm $n >/dev/null 2>&1; done
  echo "teardown: containers=[$(docker ps -aq --filter label=alloy.purpose=b2-first-promotion-throwaway | tr '\n' ' ')] networks=[$(docker network ls -q --filter label=alloy.purpose=b2-first-promotion-throwaway | tr '\n' ' ')]"
}
trap cleanup EXIT

# ── the simulated candidate (git objects only) ──────────────────────────────
export GIT_AUTHOR_NAME=Sim GIT_AUTHOR_EMAIL=sim@invalid GIT_COMMITTER_NAME=Sim GIT_COMMITTER_EMAIL=sim@invalid
export GIT_AUTHOR_DATE=2026-11-25T00:00:00Z GIT_COMMITTER_DATE=2026-11-25T00:00:00Z
BRANCH=$(git rev-parse HEAD); MAIN=$(git rev-parse origin/main); OSTAGING=$(git rev-parse origin/staging)
TREE=$(git merge-tree --write-tree "$BRANCH" "$OSTAGING" | head -1) || exit 1
STAGING=$(echo "simulated step-1 merge" | git commit-tree "$TREE" -p "$OSTAGING" -p "$BRANCH")
unset GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_DATE GIT_COMMITTER_DATE
CAND=$(bash "$REPO/docs/platform/runtime/environments-p4-evidence-2026-11-25/candidate/build-candidate.sh" "$STAGING" "$MAIN")
echo "branch=$BRANCH origin/staging=$OSTAGING origin/main=$MAIN simulated_staging=$STAGING candidate=$CAND"
REFS=(--staging "$STAGING" --main "$MAIN" --candidate "$CAND")

echo "## identify without --allow-tree-diff (M9)"
$REL identify "${REFS[@]}" > "$EV/identify-no-allowance.json"; echo "identify_rc=$?"

git archive "$CAND" supabase/migrations | tar -x -C /tmp/alloy-b2-fp || exit 1
echo "candidate_files=$(ls /tmp/alloy-b2-fp/supabase/migrations | wc -l | tr -d ' ') head=$(ls /tmp/alloy-b2-fp/supabase/migrations | sort | tail -1)"

# ── two throwaway databases with the hosted platform schemas (auth, storage) ─
start() {
  local C=$1 N=$1-net
  docker network create --internal "${LBL[@]}" $N >/dev/null || exit 1
  docker run -d --name $C --network $N --tmpfs /var/lib/postgresql/data:size=4g "${LBL[@]}" -e POSTGRES_PASSWORD=$PW $PG >/dev/null || exit 1
  for i in $(seq 1 60); do
    docker logs $C 2>&1 | grep -q 'init process complete' && docker exec $C pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
    sleep 2
  done
  docker exec $C psql -U supabase_admin -d postgres -qAt -c "alter role supabase_auth_admin password '$PW'" -c "alter role supabase_storage_admin password '$PW'" || exit 1
  docker run --rm --network $N "${LBL[@]}" --entrypoint auth -e GOTRUE_DB_DRIVER=postgres -e DB_NAMESPACE=auth \
    -e API_EXTERNAL_URL=http://127.0.0.1 -e GOTRUE_SITE_URL=http://127.0.0.1 -e GOTRUE_JWT_SECRET=b2-throwaway-not-a-secret-000000000000 \
    -e "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:$PW@$C:5432/postgres" $AUTH migrate > "$EV/$2-gotrue-migrate.log" 2>&1
  echo "$2 gotrue_migrate_rc=$?"
  docker run --rm --network $N "${LBL[@]}" --entrypoint node -e STORAGE_BACKEND=file -e TENANT_ID=stub -e FILE_STORAGE_BACKEND_PATH=/tmp \
    -e AUTH_JWT_SECRET=b2-throwaway-not-a-secret-000000000000 -e ANON_KEY=x -e SERVICE_KEY=x \
    -e "DATABASE_URL=postgres://supabase_storage_admin:$PW@$C:5432/postgres" $STORAGE dist/scripts/migrate-call.js > "$EV/$2-storage-migrate.log" 2>&1
  echo "$2 storage_migrate_rc=$?"
  docker network disconnect $N $C && docker network rm $N >/dev/null
  echo "$2 networks_attached=[$(docker inspect $C --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}')]"
}
start alloy-b2-fp-new new
start alloy-b2-fp-staging staging
NEWDB() { docker exec -i alloy-b2-fp-new psql -U postgres -d postgres "$@"; }
STGDB() { docker exec -i alloy-b2-fp-staging psql -U postgres -d postgres "$@"; }

# ── S: staging stand-in, the chain as staging's own path applied it ─────────
docker cp /tmp/alloy-b2-fp/supabase/migrations alloy-b2-fp-staging:/tmp/migrations >/dev/null
STGDB -qX -v ON_ERROR_STOP=1 -c "create schema if not exists supabase_migrations; create table if not exists supabase_migrations.schema_migrations(version text primary key, statements text[], name text);" || exit 1
: > "$EV/staging-standin-apply.log"
for f in $(ls /tmp/alloy-b2-fp/supabase/migrations | sort); do
  v=${f%%_*}; n=${f#*_}; n=${n%.sql}
  docker exec alloy-b2-fp-staging sh -c "{ cat /tmp/migrations/$f; printf '\n;insert into supabase_migrations.schema_migrations(version,name) values (%s,%s);\n' \"'$v'\" \"'$n'\"; } | psql -U postgres -X -q -v ON_ERROR_STOP=1 --single-transaction -d postgres" > /dev/null 2>&1
  rc=$?; echo "$rc $f" >> "$EV/staging-standin-apply.log"; [ $rc -ne 0 ] && { echo "staging stand-in STOPPED at $f"; exit 2; }
done
echo "staging stand-in: $(wc -l < "$EV/staging-standin-apply.log" | tr -d ' ') files applied"

# ── staging and production evidence files, as the owner's read-only commands would produce them ──
$REL emit-sql ledger | STGDB -At -X -f - > "$D/staging-ledger.txt"
$REL emit-sql fingerprint | STGDB -At -X -f - > "$D/staging-fingerprint.txt"
# Staging's real tenancy (Firefly, the two ZZ Alloy QA fixtures) is data, not chain: stand-in rows, plus the
# stand-in's own retired W-17 org. Staging tenancy is not what this rehearsal exercises.
{ node -e 'const c=require(process.argv[1]); for (const o of [c.tenancy.staging_school, ...c.tenancy.qa_fixture_orgs]) console.log(`${o.id}|active|${o.name}`)' "$REPO/scripts/release/release-config.json"
  $REL emit-sql orgs | STGDB -At -X -f -; } > "$D/staging-orgs.txt"
node -e 'const c=require(process.argv[1]); process.stdout.write(JSON.stringify({check_runs: c.required_checks.map((name)=>({name, head_sha: process.argv[2], status:"completed", conclusion:"success"}))}))' "$REPO/scripts/release/release-config.json" "$CAND" > "$D/check-runs.json"   # stub: CI green on the candidate
printf '{"gitSha":"%s","gitBranch":"staging","vercelEnv":"preview","supabaseProjectRef":"ikaxilmwmrmbagoidedu"}\n' "$STAGING" > "$D/staging-build-info.json"
printf '{"gitSha":"%s","gitBranch":"main","vercelEnv":"production","supabaseProjectRef":"vslwnntzzgpnmrpjipat"}\n' "$MAIN" > "$D/production-build-info.json"   # old main, old project: untouched
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/production-ledger.txt"; echo "new project ledger rows before: $(grep -c . "$D/production-ledger.txt")"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/production-fingerprint.txt"

echo "## M4: the release-directory config copy"
$REL first-promotion-config --new-ref $NEW_REF --out "$D/release-config.json"; echo "config_rc=$?"
C="--config $D/release-config.json"
PREP=("${REFS[@]}" --environment rehearsal --staging-build-info "$D/staging-build-info.json" --check-runs "$D/check-runs.json" --staging-ledger "$D/staging-ledger.txt" \
  --staging-orgs "$D/staging-orgs.txt" --staging-fingerprint "$D/staging-fingerprint.txt" --production-build-info "$D/production-build-info.json" --production-fingerprint "$D/production-fingerprint.txt")

echo "## refusals"
mkdir -p "$EV/refusals"
$REL plan "${REFS[@]}" --production-ledger "$D/production-ledger.txt" > "$EV/refusals/plan-routine-empty-ledger.json"; echo "plan routine over the empty ledger rc=$? (expected 1: contract_not_last)"
$REL plan "${REFS[@]}" --first-promotion --production-ledger "$D/production-ledger.txt" > "$EV/plan-first-promotion.json"; echo "plan --first-promotion rc=$? (expected 0)"
$REL plan "${REFS[@]}" --first-promotion --production-ledger "$D/staging-ledger.txt" > "$EV/refusals/plan-first-promotion-nonempty-ledger.json"; echo "plan --first-promotion over a non-empty ledger rc=$? (expected 1)"
$REL prepare "${PREP[@]}" --first-promotion --production-ledger "$D/production-ledger.txt" --out-dir "$EV/refusals/committed-config" > "$EV/refusals/prepare-committed-config.json"; echo "prepare --first-promotion with the committed config rc=$? (expected 1)"
$REL prepare "${PREP[@]}" --first-promotion $C --production-ledger "$D/staging-ledger.txt" --out-dir "$EV/refusals/nonempty" > "$EV/refusals/prepare-nonempty-ledger.json"; echo "prepare --first-promotion over a non-empty ledger rc=$? (expected 1)"

echo "## prepare (first-promotion mode)"
$REL prepare "${PREP[@]}" --first-promotion $C --production-ledger "$D/production-ledger.txt" --out-dir "$D" > "$EV/prepare.json"; echo "prepare_rc=$?"
M="--manifest $D/manifest.json"
$REL runbook $M $C > "$EV/runbook.md"; echo "runbook_rc=$?"
SHA=$(node -e 'import("'"$REPO"'/scripts/release/release-lib.mjs").then(l=>process.stdout.write(l.hashRecord(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")))))' "$D/manifest.json")

echo "## 4. owner.approval (rehearsal environment: the CLI's approve, as the tests stub the owner)"
$REL approve $M $C --approver Kelly --confirm "${SHA:0:12}" --ttl-hours 4 > "$EV/approve.json"; echo "approve_rc=$?"
A="--audit $D/audit.jsonl $M --approval $D/approval.json"
$REL record $C $A --step owner.approval --status pass --detail '{}' > /dev/null; echo "record owner.approval rc=$?"

echo "## target guard (runbook): port and project"
eval "$(grep '^fp_target()' "$EV/runbook.md")"
for u in "postgresql://postgres:x@db.$NEW_REF.supabase.co:5432/postgres" "postgresql://postgres.$NEW_REF:x@aws-0-us-west-2.pooler.supabase.com:5432/postgres" \
         "postgresql://postgres.$NEW_REF:x@aws-0-us-west-2.pooler.supabase.com:6543/postgres" "postgresql://postgres:x@db.vslwnntzzgpnmrpjipat.supabase.co:5432/postgres" "postgresql://postgres:x@db.ikaxilmwmrmbagoidedu.supabase.co:5432/postgres"; do
  r=$(fp_target "$u"); echo "fp_target rc=$? ${u//:x@/:***@} ${r}"
done | tee "$EV/target-guard.txt"

echo "## 5. production.snapshot"
docker exec alloy-b2-fp-new pg_dump -U postgres -Fc --no-owner -d postgres -f /tmp/pre-chain-empty.dump && DUMP=$(docker exec alloy-b2-fp-new sha256sum /tmp/pre-chain-empty.dump | cut -d' ' -f1)
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/before-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/before-fingerprint.txt"
$REL record $C $A --step production.snapshot --status pass --detail "{\"dump_sha256\":\"$DUMP\",\"rollback_target\":\"vslwnntzzgpnmrpjipat\"}" > /dev/null; echo "record production.snapshot rc=$?"

echo "## 6. schema.expand — the whole chain"
$REL emit-sql ledger-if-present | NEWDB -At -X -q -f - > "$D/pre-chain-ledger.txt"
$REL check-ledger $C $M --ledger "$D/pre-chain-ledger.txt" > "$EV/check-ledger.json"; echo "check-ledger rc=$?"
$REL emit-sql ledger-table | NEWDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f -; echo "ledger-table rc=$?"
START=$(date +%s); : > "$EV/apply.log"
for v in $($REL apply-order $M); do
  ( set -o pipefail; $REL emit-apply $M --version "$v" | NEWDB -v ON_ERROR_STOP=1 --single-transaction -X -q -f - > /dev/null 2>"$EV/apply-last-stderr.txt" ); rc=$?
  echo "$rc $v" >> "$EV/apply.log"
  [ $rc -ne 0 ] && { echo "STOPPED at $v"; grep -v NOTICE "$EV/apply-last-stderr.txt" | tail -20; break; }
  $REL record $C $A --step schema.expand --status applied --detail "{\"version\":\"$v\"}" > /dev/null || { echo "record refused at $v"; break; }
done
echo "chain: $(grep -c '^0 ' "$EV/apply.log") of $($REL apply-order $M | wc -l | tr -d ' ') applied, $(grep -vc '^0 ' "$EV/apply.log") failed, $(( $(date +%s) - START ))s (incl. one record per file)"
rm -f "$EV/apply-last-stderr.txt"

echo "## census (briefing §4 item 6), before any code points at the new project"
$REL emit-sql ledger | NEWDB -At -X -f - > "$D/census-ledger.txt"
$REL emit-sql fingerprint | NEWDB -At -X -f - > "$D/census-fingerprint.txt"
$REL emit-sql orgs | NEWDB -At -X -f - > "$D/census-orgs.txt"
$REL emit-sql census | NEWDB -At -X -f - > "$D/census-extras.txt"
$REL check-production $C $M --stage schema --ledger "$D/census-ledger.txt" --fingerprint "$D/census-fingerprint.txt" --orgs "$D/census-orgs.txt" --census "$D/census-extras.txt" > "$EV/check-schema.json"; echo "check-production --stage schema rc=$?"
$REL record $C $A --step schema.expand --status pass --detail '{}' > /dev/null; echo "record schema.expand rc=$?"
diff "$D/staging-fingerprint.txt" "$D/census-fingerprint.txt" > /dev/null && echo "fingerprint: new project == staging stand-in" || echo "fingerprint: DIFFERS"

echo "## 7. code.deploy (simulated: build-info after the fast-forward, wired to the new project)"
printf '{"gitSha":"%s","gitBranch":"main","vercelEnv":"production","supabaseProjectRef":"%s"}\n' "$CAND" "$NEW_REF" > "$D/after-build-info.json"
$REL record $C $A --step code.deploy --status pass --detail "{\"main\":\"$CAND\",\"simulated\":true}" > /dev/null; echo "record code.deploy rc=$?"

echo "## 8. production.verify"
cp "$D/census-ledger.txt" "$D/after-ledger.txt"; cp "$D/census-fingerprint.txt" "$D/after-fingerprint.txt"; cp "$D/census-orgs.txt" "$D/after-orgs.txt"
$REL check-production $C $M --build-info "$D/after-build-info.json" --ledger "$D/after-ledger.txt" --fingerprint "$D/after-fingerprint.txt" --orgs "$D/after-orgs.txt" --stage final > "$EV/check-production-final.json"; echo "check-production --stage final rc=$?"
printf '{"gitSha":"%s","gitBranch":"main","vercelEnv":"production","supabaseProjectRef":"vslwnntzzgpnmrpjipat"}\n' "$CAND" > "$EV/refusals/after-build-info-old-ref.json"
$REL check-production $C $M --build-info "$EV/refusals/after-build-info-old-ref.json" --ledger "$D/after-ledger.txt" --fingerprint "$D/after-fingerprint.txt" --orgs "$D/after-orgs.txt" --stage final > "$EV/refusals/check-production-old-ref.json"; echo "check-production with the old ref rc=$? (expected 1)"
$REL check-production $M --build-info "$D/after-build-info.json" --ledger "$D/after-ledger.txt" --fingerprint "$D/after-fingerprint.txt" --orgs "$D/after-orgs.txt" --stage final > /dev/null 2> "$EV/refusals/check-production-committed-config.txt"; echo "check-production with the committed config rc=$? (expected 1)"
$REL record $C $A --step production.verify --status pass --detail '{}' > /dev/null; echo "record production.verify rc=$?"

echo "## 9–10. schema.contract (skip), release.record, verify-audit"
DESTR=$(node -e 'process.stdout.write(String(require(process.argv[1]).migrations.destructive_in_chain.length))' "$D/manifest.json")
$REL record $C $A --step schema.contract --status skip --detail "{\"reason\":\"first promotion: destructive files ran in version order at schema.expand\",\"destructive_in_chain\":$DESTR}" > /dev/null; echo "record schema.contract rc=$?"
$REL record $C $A --step release.record --status pass --detail '{}' > /dev/null; echo "record release.record rc=$?"
$REL verify-audit "$D/audit.jsonl" > "$EV/verify-audit.json"; echo "verify-audit rc=$?"
echo "audit steps: $(node -e 'const l=require("fs").readFileSync(process.argv[1],"utf8").trim().split("\n").map(JSON.parse); const c={}; for (const e of l) { const k=e.step+":"+e.status; c[k]=(c[k]||0)+1 } console.log(JSON.stringify(c))' "$D/audit.jsonl")"

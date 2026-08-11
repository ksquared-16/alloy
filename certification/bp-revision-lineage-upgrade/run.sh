#!/usr/bin/env bash
# Business Process revision lineage — DATA-BEARING upgrade certification (D-76).
#
# Every other Trust/BP suite provisions an empty database, applies migrations and
# asserts. That shape is exactly why `20260807090000_business_process_publish_idempotency`
# shipped broken: its lineage backfill is an UPDATE, the immutability trigger
# created by the EARLIER `20260730120000` refuses every UPDATE, and on an empty
# table the backfill touches zero rows so the trigger never fires. The defect is
# invisible precisely where it is tested and fatal where it is not — the shared
# tenant, which holds seven revisions.
#
# So this suite seeds representative history FIRST and migrates over it. It is
# the only certification in the repository that answers "does this chain apply to
# a database that already has data".
#
# The sequence mirrors a real upgrade, in canonical migration order:
#
#   1. schema after the immutability trigger exists, before BP idempotency
#   2. seed 7 revisions on one subject — 6 need lineage (Firefly's shape)
#   3. prove ordinary UPDATE is refused
#   4. apply the compatibility pre-backfill        20260806090000
#   5. prove lineage is correct
#   6. prove UPDATE is STILL refused
#   7. apply BP idempotency                        20260807090000   <- used to fail here
#   8. prove it completes
#   9. apply the guarded-write repair              20260810220000
#  10. prove publish AND rollback hold the token
#  11. prove the immutable/runtime invariants still hold
#
# Disposable container on its own port. Touches no shared Supabase stack;
# `supabase start` is never invoked.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/bp-revision-lineage-upgrade"
MIG="$ROOT/supabase/migrations"
CONTAINER="alloy-bp-lineage-upgrade-cert"
PORT="${BP_LINEAGE_CERT_PORT:-54726}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "--- starting disposable postgres on :$PORT ---"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:17-alpine >/dev/null

# Readiness must HOLD, not merely happen once: `initdb` answers the unix socket
# from a temporary server that is then shut down, so a bare `pg_isready` can
# succeed and the next call exit 2, killing this script under `set -e`.
# Rationale in certification/trust-runtime-v1/run.sh.
ready=0
for _ in $(seq 1 90); do
    if docker exec "$CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 \
        && docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then
        ready=$((ready + 1))
        if [ "$ready" -ge 3 ]; then break; fi
    else
        ready=0
    fi
    sleep 1
done
if [ "$ready" -lt 3 ]; then
    echo "FAIL: postgres never became durably ready on :$PORT" >&2
    docker logs "$CONTAINER" 2>&1 | tail -20 >&2
    exit 1
fi

run_sql() {
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$1"
}

echo "--- 1. tenancy prerequisites ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- 1. has_org_role (the RLS policies below call it) ---"
run_sql "$MIG/20260718140000_has_org_role_security_definer.sql"

echo "--- 1. configuration publication runtime (owns the shared immutability guard) ---"
run_sql "$MIG/20260722020000_configuration_publication_runtime_v1.sql"

echo "--- 1. business process publication (creates the table AND its immutability trigger) ---"
run_sql "$MIG/20260730120000_business_process_configuration_publication_v1.sql"

echo "--- 1. lifecycle projection write guard ---"
run_sql "$MIG/20260730130000_business_process_projection_write_guard.sql"

echo "--- 2. seed representative PRE-EXISTING revision history ---"
run_sql "$CERT_DIR/01_seed_existing_history.sql"

echo "--- 3. prove ordinary UPDATE is refused before the repair ---"
run_sql "$CERT_DIR/02_update_refused_before.sql"

echo "--- 4. compatibility pre-backfill (the repair under test) ---"
run_sql "$MIG/20260806090000_business_process_revision_lineage_prebackfill.sql"

echo "--- 4b. re-apply: proves the migration is inert once lineage exists (advanced environments) ---"
run_sql "$MIG/20260806090000_business_process_revision_lineage_prebackfill.sql"
run_sql "$CERT_DIR/05_reapply_is_noop.sql"

echo "--- 5-6. lineage correct, immutability preserved ---"
run_sql "$CERT_DIR/03_lineage_correct.sql"

echo "--- 7-8. BP publish idempotency — the migration that could not run before ---"
run_sql "$MIG/20260807090000_business_process_publish_idempotency.sql"

echo "--- 9. guarded-write restoration ---"
run_sql "$MIG/20260810220000_restore_business_process_publish_guarded_write.sql"

echo "--- 10-11. final invariants ---"
run_sql "$CERT_DIR/04_final_invariants.sql"

echo "CERTIFICATION COMPLETE"

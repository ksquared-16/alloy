#!/usr/bin/env bash
# D-96 / D-97 — process-instance revision pin and published-revision self-containment.
#
# Runs in a DISPOSABLE Postgres container on its own port, following
# certification/bp-revision-lineage-upgrade/run.sh. It never touches the shared Supabase stack, so
# it cannot disturb another session's work, and `supabase start` is never invoked.
#
# It replays the REAL Business Process publication chain and the REAL process_instances migration
# before the pin migration, so the change is proven additive against the schema it actually has to
# migrate rather than against a schema authored to suit it. The publication half runs through the
# genuine publish/rollback RPCs — every claim about what publishing does is made by the function
# that does it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/process-instance-revision-pin"
MIG="$ROOT/supabase/migrations"
CONTAINER="alloy-cert-process-instance-revision-pin"
PORT="${PI_REVISION_PIN_CERT_PORT:-54733}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "--- starting disposable postgres on :$PORT ---"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:17-alpine >/dev/null

# Readiness must HOLD, not merely happen once: `initdb` answers from a temporary server that is then
# shut down, so a bare `pg_isready` can succeed and the next call exit 2, killing this script under
# `set -e`. Rationale in certification/trust-runtime-v1/run.sh.
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

echo "--- tenancy prerequisites ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- has_org_role (the RLS policies below call it) ---"
run_sql "$MIG/20260718140000_has_org_role_security_definer.sql"

echo "--- configuration publication runtime (owns the shared immutability guard) ---"
run_sql "$MIG/20260722020000_configuration_publication_runtime_v1.sql"

echo "--- business process publication (revisions, drafts, publish/rollback RPCs) ---"
run_sql "$MIG/20260730120000_business_process_configuration_publication_v1.sql"

echo "--- lifecycle projection write guard ---"
run_sql "$MIG/20260730130000_business_process_projection_write_guard.sql"

echo "--- revision lineage pre-backfill ---"
run_sql "$MIG/20260806090000_business_process_revision_lineage_prebackfill.sql"

echo "--- publish idempotency ---"
run_sql "$MIG/20260807090000_business_process_publish_idempotency.sql"

echo "--- guarded-write restoration (publish AND rollback hold the projection token) ---"
run_sql "$MIG/20260810220000_restore_business_process_publish_guarded_write.sql"

echo "--- process_instances ---"
run_sql "$MIG/20260713000000_process_instances.sql"

echo "--- the D-96 revision pin migration under test ---"
run_sql "$MIG/20260816120000_process_instances_business_process_revision_pin.sql"

echo "--- D-96 / D-97 invariant assertions ---"
run_sql "$CERT_DIR/01_pin_and_self_containment.sql"

echo "CERTIFICATION COMPLETE"

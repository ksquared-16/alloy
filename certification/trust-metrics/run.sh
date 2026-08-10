#!/usr/bin/env bash
# =============================================================================
# Phase 0 Slice 0.6 — Trust measurement sources certification.
#
# Runs in a DISPOSABLE Postgres container. Touches no shared Supabase stack and
# requires no lease, so it can never disturb another sprint's tenant.
#
# Replays the Trust migration chain, then asserts what the OI metric resolvers
# depend on: decimal cost round-trips, org scoping holds, window indexes exist,
# the Decision Package schema carries no provider identity, no Trust table
# persists provider identity or site linkage at all, and reading changes nothing.
#
# THIS SLICE ADDS NO MIGRATION. The chain below is the existing one, replayed
# so the assertions run against a real schema.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/trust-metrics"
SHARED_FIXTURE="$ROOT/certification/trust-runtime-v1/00_fixture.sql"
CONTAINER="alloy-trust-metrics-cert"
PORT="${TRUST_METRICS_CERT_PORT:-54771}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "--- starting disposable postgres on :$PORT ---"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:17-alpine >/dev/null

# Readiness must HOLD, not merely happen once: `initdb` answers the unix socket
# from a temporary server that is then shut down, so a bare `pg_isready` can
# succeed and the next call exit 2, killing this script under `set -e`. Probe
# over TCP (not served during init) and require the answer to persist.
# Full rationale in certification/trust-runtime-v1/run.sh.
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

echo "--- tenancy fixture ---"
run_sql "$SHARED_FIXTURE"

echo "--- Trust Runtime V1 foundation ---"
run_sql "$ROOT/supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql"

echo "--- Trust Runtime V1 privilege correction ---"
run_sql "$ROOT/supabase/migrations/20260803230000_trust_runtime_v1_privilege_correction.sql"

echo "--- lifecycle observation kinds ---"
run_sql "$ROOT/supabase/migrations/20260804210000_trust_lifecycle_observation_kinds.sql"

echo "--- assertions ---"
run_sql "$CERT_DIR/01_measurement_sources.sql"

echo "TRUST MEASUREMENT CERTIFICATION COMPLETE"

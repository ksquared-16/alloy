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

for _ in $(seq 1 60); do
    if docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    sleep 1
done
docker exec "$CONTAINER" pg_isready -U postgres >/dev/null

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

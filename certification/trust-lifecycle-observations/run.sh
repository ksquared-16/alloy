#!/usr/bin/env bash
# =============================================================================
# Phase 0 Slice 0.4 — lifecycle observation vocabulary certification.
#
# Runs in a DISPOSABLE Postgres container. Touches no shared Supabase stack and
# requires no lease, so it can never disturb another sprint's tenant.
#
# Replays the Trust migration chain in order:
#   foundation → privilege correction → lifecycle observation kinds
# then asserts the vocabulary, append-only, tenancy, privilege and immutability
# properties against the resulting database.
#
# The migration is applied TWICE to prove independent replay safety.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/trust-lifecycle-observations"
SHARED_FIXTURE="$ROOT/certification/trust-runtime-v1/00_fixture.sql"
CONTAINER="alloy-trust-lifecycle-cert"
PORT="${TRUST_LIFECYCLE_CERT_PORT:-54751}"

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

echo "--- lifecycle observation kinds (first application) ---"
run_sql "$ROOT/supabase/migrations/20260804210000_trust_lifecycle_observation_kinds.sql"

echo "--- lifecycle observation kinds (REPLAY — must converge, not fail) ---"
run_sql "$ROOT/supabase/migrations/20260804210000_trust_lifecycle_observation_kinds.sql"

echo "--- assertions ---"
run_sql "$CERT_DIR/01_observation_vocabulary.sql"

echo "LIFECYCLE OBSERVATION CERTIFICATION COMPLETE"

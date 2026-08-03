#!/usr/bin/env bash
# Trust Runtime V1 — Slice 1 database certification.
#
# Runs in a DISPOSABLE Postgres container. Touches no shared Supabase stack.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/trust-runtime-v1"
CONTAINER="alloy-trust-cert-slice1"
PORT="${TRUST_CERT_PORT:-54721}"

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

echo "--- fixture ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- applying the Trust Runtime V1 migration ---"
run_sql "$ROOT/supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql"

echo "--- invariant assertions ---"
run_sql "$CERT_DIR/01_slice1_invariants.sql"

echo "CERTIFICATION COMPLETE"

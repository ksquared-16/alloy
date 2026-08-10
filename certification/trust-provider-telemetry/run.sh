#!/usr/bin/env bash
# Trust Adoption Phase 2.5 — provider telemetry database certification.
#
# Runs in a DISPOSABLE Postgres container, following the pattern established by
# certification/trust-runtime-v1/run.sh. Touches no shared Supabase stack, so it
# cannot disturb another session's work.
#
# It replays the ORIGINAL Trust foundation migration first, then the Phase 2.5
# migration on top — proving the change is genuinely additive against the schema
# it has to migrate, rather than against a schema authored to suit it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/trust-provider-telemetry"
BASE_DIR="$ROOT/certification/trust-runtime-v1"
CONTAINER="alloy-trust-cert-provider-telemetry"
PORT="${TRUST_PROVIDER_TELEMETRY_CERT_PORT:-54723}"

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

echo "--- tenancy fixture (shared with the Runtime V1 suite) ---"
run_sql "$BASE_DIR/00_fixture.sql"

echo "--- applying the Trust Runtime V1 foundation ---"
run_sql "$ROOT/supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql"

echo "--- applying the Phase 2.5 provider telemetry migration ---"
run_sql "$ROOT/supabase/migrations/20260807210000_trust_provider_telemetry.sql"

echo "--- provider telemetry invariant assertions ---"
run_sql "$CERT_DIR/01_provider_telemetry_invariants.sql"

echo "CERTIFICATION COMPLETE"

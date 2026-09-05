#!/usr/bin/env bash
# =============================================================================
# PLACEMENT INVARIANT CERTIFICATION
#
# Runs in a DISPOSABLE Postgres container. Touches no shared Supabase stack and requires no lease,
# so it can never disturb another sprint's tenant.
#
# Why this exists. The placement subsystem's uniqueness, tenancy and identity rules are enforced by
# the DATABASE — three partial unique indexes and a consistency trigger that also back-fills
# `customer_member_id` and `person_id`. The application depends on that back-fill and on that
# uniqueness, and until this suite nothing in the repository verified either: an audit of the whole
# test tree found zero references to any placement constraint or trigger by name. A migration could
# relax them and every TypeScript test would stay green.
#
# The assertions provoke the real objects and check that the DATABASE refused. They do not restate
# the constraints in test-only logic, which would only certify the restatement.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/placement-invariants"
CONTAINER="alloy-placement-invariants-cert"
PORT="${PLACEMENT_CERT_PORT:-54782}"
# The house default matches the other certification suites. Overridable so the suite can run on a
# host whose registry access differs (any Postgres 15+ image satisfies these assertions).
IMAGE="${PLACEMENT_CERT_IMAGE:-postgres:17-alpine}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "--- starting disposable postgres ($IMAGE) on :$PORT ---"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" "$IMAGE" >/dev/null

# Readiness must HOLD, not merely happen once — `initdb` answers from a temporary server that is
# then shut down. Same rationale as certification/trust-runtime-v1/run.sh.
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

echo "--- placement dependency fixture ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- waitlist placement foundation (real migration) ---"
run_sql "$ROOT/supabase/migrations/20260616120000_waitlist_placement_foundation.sql"

echo "--- assertions ---"
run_sql "$CERT_DIR/01_placement_invariants.sql"

echo "PLACEMENT INVARIANT CERTIFICATION COMPLETE"

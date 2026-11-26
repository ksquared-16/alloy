#!/usr/bin/env bash
# D-94 — session-pinned participant Form versions. Database certification.
#
# Runs in a DISPOSABLE Postgres container on its own port, following
# certification/trust-provider-telemetry/run.sh. It never touches the shared Supabase
# stack, so it cannot disturb another session's work.
#
# It replays the REAL Forms migrations first and the D-94 migration on top, proving the
# change is genuinely additive against the schema it actually has to migrate rather than
# against a schema authored to suit it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/enrollment-session-form-version"
CONTAINER="alloy-cert-enrollment-session-form-version"
PORT="${ENROLLMENT_SESSION_VERSION_CERT_PORT:-54731}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "--- starting disposable postgres on :$PORT ---"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres -p "$PORT:5432" postgres:17-alpine >/dev/null

# Readiness must HOLD, not merely happen once: `initdb` answers from a temporary server
# that is then shut down, so a bare `pg_isready` can succeed and the next call exit 2,
# killing this script under `set -e`. Require the answer to persist.
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

echo "--- minimal tenancy fixture ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- applying the Forms engine foundation ---"
run_sql "$ROOT/supabase/migrations/20260506100000_forms_engine_v1_foundation.sql"

echo "--- applying the Forms packet foundation ---"
run_sql "$ROOT/supabase/migrations/20260510120000_forms_packet_foundation.sql"

echo "--- applying the D-94 session version migration ---"
run_sql "$ROOT/supabase/migrations/20260815120000_form_packet_session_item_resolved_version.sql"

echo "--- D-94 invariant assertions (8 properties) ---"
run_sql "$CERT_DIR/01_session_version_invariants.sql"

echo "CERTIFICATION COMPLETE"

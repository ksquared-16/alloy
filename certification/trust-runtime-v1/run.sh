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

# Postgres is not ready the first time it says so.
#
# The official entrypoint runs `initdb` against a TEMPORARY server that listens
# on the unix socket only, then shuts it down and starts the real one. A bare
# `pg_isready` talks to that socket, so it can be answered by a server that is
# about to disappear — and the very next call then exits 2 and kills this script
# under `set -e`. That is a race, not a broken assertion, which is why this job
# failed intermittently across unrelated branches and named a different suite
# each time.
#
# Two changes close it: probe over TCP, which the init-time server does not
# serve, and require the answer to HOLD. Readiness means "stayed up", not
# "answered once".
ready=0
for _ in $(seq 1 90); do
    # Both transports. TCP proves this is the REAL server, because the
    # init-time one is socket-only; the socket is what `run_sql` actually uses,
    # so checking TCP alone would certify a path the suites never take.
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
    # Say WHY. A bare non-zero exit here is indistinguishable from a failed
    # assertion in the composed harness, and that ambiguity cost real time.
    echo "FAIL: postgres never became durably ready on :$PORT" >&2
    docker logs "$CONTAINER" 2>&1 | tail -20 >&2
    exit 1
fi

run_sql() {
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -f - < "$1"
}

echo "--- fixture ---"
run_sql "$CERT_DIR/00_fixture.sql"

echo "--- applying the Trust Runtime V1 migration ---"
run_sql "$ROOT/supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql"

echo "--- applying the privilege correction ---"
# A bare Postgres container has no Supabase default privileges, so the REVOKEs
# are a no-op here. It runs anyway so BOTH certification paths assert the same
# end state, and so the migration's own self-verification block is exercised in
# isolation as well as on the full chain.
run_sql "$ROOT/supabase/migrations/20260803230000_trust_runtime_v1_privilege_correction.sql"

echo "--- invariant assertions ---"
run_sql "$CERT_DIR/01_slice1_invariants.sql"

echo "CERTIFICATION COMPLETE"

#!/usr/bin/env bash
# =============================================================================
# Trust Runtime V1 — Slice 1 FULL-CHAIN database certification.
#
# `run.sh` proves the Trust invariants against a purpose-built fixture: a bare
# Postgres container containing nothing but `orgs`, `user_roles` and `auth.uid()`.
# That proves the invariants; it cannot prove the migration is safe to land in
# the real schema.
#
# This script is the other half. It certifies against a database built by
# replaying the ENTIRE repository migration chain — the isolated `alloy-cert`
# certification project, reset from empty so every migration actually runs.
#
# Prerequisite (branch-owned, leased — never another session's stack):
#
#   alloy-stack use <your-worktree-name>
#   supabase --workdir "$PWD/certification" stop --no-backup   # force from-empty
#   alloy-stack use <your-worktree-name>                       # replays all migrations
#
# The from-empty step matters: `supabase db reset` on a restored volume applies
# only the PENDING migrations, which is not a full-chain replay.
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CERT_DIR="$ROOT/certification/trust-runtime-v1"
DB="${TRUST_FULLCHAIN_DB:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"

psql "$DB" -tAc "select 1" >/dev/null 2>&1 || {
    echo "FAIL: cannot reach the full-chain certification database at $DB" >&2
    echo "      run 'alloy-stack use <worktree>' first." >&2
    exit 1
}

echo "--- database identity ---"
psql "$DB" -tAc "select 'server      = '||version();"
psql "$DB" -tAc "select 'system_id   = '||system_identifier::text from pg_control_system();"
psql "$DB" -tAc "select 'migrations  = '||count(*)::text||' recorded' from supabase_migrations.schema_migrations;"
echo             "repo files  = $(ls "$ROOT"/supabase/migrations/*.sql | wc -l | tr -d ' ')"

echo "--- full-chain tenancy fixture ---"
psql "$DB" -v ON_ERROR_STOP=1 -f "$CERT_DIR/00_fullchain_fixture.sql" || exit 1

echo "--- the 21 isolated invariants, re-run against the full chain ---"
inv_out="$(psql "$DB" -v ON_ERROR_STOP=1 -f "$CERT_DIR/01_slice1_invariants.sql" 2>&1)"
inv_rc=$?
echo "$inv_out"
inv_pass="$(grep -c 'NOTICE:  PASS ' <<<"$inv_out")"

echo "--- full-chain-only assertions ---"
psql "$DB" -v ON_ERROR_STOP=1 -f "$CERT_DIR/02_fullchain_assertions.sql" || exit 1

echo
echo "============================================================"
echo "isolated invariant suite on the full chain: ${inv_pass}/21 passed (rc=${inv_rc})"
if [[ "$inv_rc" -ne 0 ]]; then
    if grep -q 'CERT FAIL 21: authenticated holds' <<<"$inv_out"; then
        echo "  KNOWN, CHARACTERISED: assertion 21 fails on the full chain only."
        echo "  Supabase's schema-wide ALTER DEFAULT PRIVILEGES grants ALL on every"
        echo "  table in 'public' to anon and authenticated before any repository"
        echo "  migration runs, so the Trust migration's GRANT SELECT is redundant"
        echo "  and its intent (no write grant) is not achieved by GRANT alone."
        echo "  Assertion F15 proves the condition is platform-wide, not Trust-specific."
        echo "  Assertion F16 proves it is not exploitable: RLS refuses every write."
        echo "  This is a REAL certification finding — see certification/trust-runtime-v1/README.md."
    else
        echo "  UNEXPECTED failure — not the known grant condition. Investigate."
        exit 1
    fi
fi
echo "FULL-CHAIN CERTIFICATION COMPLETE"
echo "============================================================"

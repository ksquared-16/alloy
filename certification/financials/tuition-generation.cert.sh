#!/usr/bin/env bash
# =============================================================================
# THREAD 7 — TUITION GENERATION: accepted term → occurrence → obligation → draft charge.
#
# The cases live in web/tests/financials/live/tuitionGeneration.live.test.ts and run against the
# real certification database. This harness owns the one thing they cannot: clearing POSTED tuition
# money between runs.
#
# A posted childcare charge refuses DELETE, and that refusal is a guarantee this thread depends on —
# so the teardown suspends triggers deliberately and briefly, exactly as
# certification/fixtures/financials-charge-spine.sql already does for the same reason. A test that
# quietly relaxed the constraint to clean up after itself would be certifying a weaker rule than the
# one production runs under.
#
# Usage:  certification/financials/tuition-generation.cert.sh
# Requires: the shared cert stack up, psql on PATH.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
ORG='00000000-0000-4000-8000-000000000001'

echo "── clearing tuition lineage (posted money included, triggers suspended for teardown only)"
psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
-- The journal names its source generically (source_type / source_id), not with a charge column.
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges where org_id = '$ORG' and charge_category = 'tuition');
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges where org_id = '$ORG' and charge_category = 'tuition';
set session_replication_role = default;
SQL
[ $? -eq 0 ] || { echo "✗ teardown failed"; exit 1; }

echo "── the tuition charge template this organisation must have authored"
psql "$DB" -tAc "select count(*) from public.financial_charge_templates where org_id='$ORG' and template_key='tuition' and is_active" \
  | grep -q '^1$' || { echo "✗ no active 'tuition' charge template — the seed authors one"; exit 1; }

echo "── running the live cases"
( cd "$ROOT/web" && npx vitest run tests/financials/live/tuitionGeneration.live.test.ts --no-file-parallelism 2>&1 | tail -25 )

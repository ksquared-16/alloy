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
pass=0; fail=0
check(){ if [ "$1" -eq 0 ]; then echo "  ✓ $2"; pass=$((pass+1)); else echo "  ✗ $2"; fail=$((fail+1)); fi; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
ORG='00000000-0000-4000-8000-000000000001'
APP="${CERT_APP_URL:-http://localhost:3012}"
PW="$ROOT/web/node_modules/.bin/playwright"

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
# Serially and in this order: the slice establishes the happy path and the two lineage invariants,
# the matrix then walks the edges. Both drive one tenant, so they cannot run in parallel.
# The exit status is the RUNNER'S, not the pipeline's: `| tail` would otherwise report success no
# matter what vitest thought, and a harness that cannot fail is not a harness.
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/tuitionGeneration.live.test.ts \
    tests/financials/live/tuitionGenerationMatrix.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — the vertical slice, the lineage invariants and the matrix"

# =============================================================================
# THE OPERATOR BOUNDARY, in the real application.
#
# Thread 7 builds no screen — generation is a registered action so Thread 4 can place a surface over
# it later. So the browser proof is an unusual shape and pretending otherwise would be the dishonest
# part: the accepted price is VISIBLE, generation is INVOKED through the production command boundary
# from the operator's own authenticated session, and the draft, the posting and the retry are all
# read back through the existing Financials presentation.
#
# The fixture below is setup, not proof: an ENROLLED assignment with an accepted term, because
# recurring tuition bills against an enrolment agreement and the representative tenant ships none.
# =============================================================================
if [ "${CERT_BROWSER:-0}" = "1" ]; then
  echo
  echo "── preparing an enrolled assignment with an accepted term"
  # THE CURRENT MONTH, because the Financials card shows the period the operator is in. Billing a
  # far-future month would generate correctly and prove nothing about what an operator can SEE.
  PERIOD="${CERT_TUITION_PERIOD:-$(date -u +%Y-%m)}"
  AGREEMENT='79000000-0000-4000-8000-00000000a001'
  TERM='79000000-0000-4000-8000-00000000b001'
  # The assignment behind the row the New Leads queue opens FIRST — the same subject the mounted
  # certifications already prove reachable. Preparing any other one would make the browser proof
  # depend on a queue ordering nobody promised.
  QUEUE_FIRST="${CERT_TUITION_SUBJECT:-00000000-0000-4000-8000-40000000099b}"
  read -r OCM MEMBER CUSTOMER OPP <<<"$(psql "$DB" -tA -F' ' -c "
    select o.id, o.customer_member_id, m.customer_id, o.opportunity_id
      from public.opportunity_customer_members o
      join public.customer_members m on m.id = o.customer_member_id
     where o.org_id = '$ORG' and o.opportunity_id = '$QUEUE_FIRST'
     limit 1;")"
  [ -n "${OCM:-}" ] || { echo "  ✗ no assignment on the queue's first opportunity"; fail=$((fail+1)); OCM=""; }
  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
delete from public.enrollment_pricing_terms where org_id = '$ORG';
insert into public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_customer_member_id, status, start_date)
select '$AGREEMENT', '$ORG', '$MEMBER', '$CUSTOMER',
       (select id from public.locations where org_id = '$ORG' limit 1), '$OCM', 'active', '2026-01-01'
on conflict (id) do update set
    status = 'active',
    -- REPOINT, do not merely reactivate. A fixture row left over from a run against a different
    -- subject would otherwise keep that subject's household, and the generated charge would land on
    -- a family the card is not showing — a green generation with an empty ledger.
    customer_member_id = excluded.customer_member_id,
    customer_id = excluded.customer_id,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id;
insert into public.enrollment_pricing_terms
    (id, org_id, opportunity_customer_member_id, customer_member_id, enrollment_agreement_id, term_kind,
     source_entity, source_id, recommended_source_id, cadence_key, payer_type, amount_cents, currency_code,
     state, override_reason, resolution_key, effective_start, accepted_by)
select '$TERM', '$ORG', '$OCM', '$MEMBER', '$AGREEMENT', 'tuition',
       'commercial_tuition_rates', r.id, r.id, 'monthly', 'private_pay', 121000, 'USD',
       'overridden', 'Sibling arrangement agreed with the director', 'cert-browser', '2026-01-01',
       '00000000-0000-4000-8000-0000000000aa'
  from public.commercial_tuition_rates r where r.org_id = '$ORG' limit 1
on conflict (id) do update set
    amount_cents = excluded.amount_cents,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id,
    customer_member_id = excluded.customer_member_id,
    enrollment_agreement_id = excluded.enrollment_agreement_id;
SQL
  check $? "an enrolled assignment carries an accepted, overridden term"

  # The fixture is only setup if it is scoped to the subject the browser will open. Asserting it here
  # turns "the ledger was empty" into "the agreement pointed at another household", which is the
  # difference between a diagnosable failure and an afternoon.
  psql "$DB" -tAc "select count(*) from public.child_enrollment_agreements a
     join public.opportunity_customer_members o on o.id = a.opportunity_customer_member_id
    where a.id = '$AGREEMENT' and o.opportunity_id = '$QUEUE_FIRST' and a.status = 'active'" \
    | grep -q '^1$'
  check $? "the agreement is scoped to the household the browser opens"

  echo "── driving the application"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       CERT_TUITION_PERIOD="$PERIOD" CERT_TUITION_SUBJECT="$QUEUE_FIRST" \
       CERT_TUITION_CUSTOMER="$CUSTOMER" \
       "$PW" test -c playwright.config.ts playwright/tuition-generation.cert.spec.ts --workers=1 --reporter=line >/dev/null 2>&1 )
  check $? "accepted price visible, generated through the command boundary, drafted, posted, retried"

  # ── AND IT PUTS THE TENANT BACK ───────────────────────────────────────────────────────────────
  #
  # AFTER the product assertions, never before. The enrolment agreement this fixture creates is not
  # inert: the Financials card resolves a charge's SUBJECT from the agreements a household has, so
  # leaving it standing renamed an unrelated household-level charge in Thread 2's smoke and failed a
  # certification that had nothing to do with tuition. A fixture that changes what a neighbouring
  # proof reads is not setup, it is contamination.
  #
  # The trigger suspension is fixture cleanup only — posted tuition refuses DELETE, and that refusal
  # is a product guarantee this thread asserts elsewhere and does not relax.
  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges where org_id = '$ORG' and charge_category = 'tuition');
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges where org_id = '$ORG' and charge_category = 'tuition';
set session_replication_role = default;
delete from public.enrollment_pricing_terms where id = '$TERM';
delete from public.child_enrollment_agreements where id = '$AGREEMENT';
SQL
  check $? "the tenant is left as the browser proof found it"
fi

echo; echo "RESULT: ${pass:-0} passed, ${fail:-0} failed"
[ "${fail:-0}" -eq 0 ]

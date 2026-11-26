#!/usr/bin/env bash
# =============================================================================
# THREAD 10 — DISCOUNTS, CREDITS AND ADJUSTMENTS: what legitimately reduces a bill.
#
# The cases live in web/tests/financials/live/financialReductions.live.test.ts and run against the
# real certification database. This harness owns the one thing they cannot: clearing POSTED
# reduction money between runs.
#
# A posted childcare charge refuses DELETE, and that refusal is a guarantee this thread depends on
# and certifies — so the teardown suspends triggers deliberately and briefly, exactly as
# certification/financials/tuition-generation.cert.sh already does for the same reason. This is
# FIXTURE CLEANUP AFTER THE PRODUCT ASSERTIONS, never a relaxation of the rule the product runs
# under. A test that quietly weakened the constraint to tidy up would be certifying a weaker
# platform than the one families are billed by.
#
# Usage:  certification/financials/financial-reductions.cert.sh   [CERT_BROWSER=1]
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

echo "── clearing reduction lineage (posted money included, triggers suspended for teardown only)"
psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
-- Applications first: charge_id is ON DELETE RESTRICT, because a reduction charge must not be
-- removable out from under the decision that explains it.
delete from public.financial_reduction_applications where org_id = '$ORG';
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges
                      where org_id = '$ORG' and charge_category in ('discount', 'credit', 'adjustment'));
delete from public.charges
 where org_id = '$ORG' and charge_category in ('discount', 'credit', 'adjustment');
-- AND THE GROSS THIS THREAD REDUCES. Thread 7's own certification leaves a POSTED tuition charge
-- for the current month, and a settled month is correctly refused rather than regenerated — so the
-- browser proof would have nothing to discount. Clearing it here is this harness owning its own
-- fixture, not Thread 10 reaching into Thread 7's guarantees.
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges where org_id = '$ORG' and charge_category = 'tuition');
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events
                                 where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges where org_id = '$ORG' and charge_category = 'tuition';
set session_replication_role = default;
delete from public.commercial_policies
 where org_id = '$ORG' and policy_type in ('discount', 'sibling_discount', 'waiver');
SQL
[ $? -eq 0 ] || { echo "✗ teardown failed"; exit 1; }

echo "── the substrate this thread reduces through"
psql "$DB" -tAc "select count(*) from public.financial_charge_templates where org_id='$ORG' and template_key='tuition' and is_active" \
  | grep -q '^1$' || { echo "✗ no active 'tuition' charge template — Thread 7's gross cannot be generated"; exit 1; }
psql "$DB" -tAc "select count(*) from public.role_permission_grants where permission_key='fin.adjust'" \
  | grep -qv '^0$' || { echo "✗ fin.adjust is not granted to any role — the migration has not run"; exit 1; }

echo "── running the live cases"
# The exit status is the RUNNER'S, not the pipeline's: `| tail` would otherwise report success no
# matter what vitest thought, and a harness that cannot fail is not a harness.
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/financialReductions.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — eligibility, stacking, caps, effective dating, retry, posting, manual"

# =============================================================================
# THE OPERATOR BOUNDARY, in the real application.
#
# Thread 10 builds no screen either — the reductions are registered actions so Thread 4 can place a
# surface over them. What the browser proves is the part that IS visible: the existing Financials
# card shows GROSS separately from what reduced it, with human labels and a net an operator can act
# on. And it proves the part that must never be visible-only: an unauthorized caller is refused by
# the SERVER, not by a hidden button.
# =============================================================================
if [ "${CERT_BROWSER:-0}" = "1" ]; then
  echo
  echo "── preparing an enrolled assignment, an accepted term and an authored discount"
  # The CURRENT month, because the Financials card shows the period the operator is in. Billing a
  # far-future month would reduce correctly and prove nothing about what an operator can SEE.
  PERIOD="${CERT_REDUCTION_PERIOD:-$(date -u +%Y-%m)}"
  AGREEMENT='7b000000-0000-4000-8000-00000000a001'
  TERM='7b000000-0000-4000-8000-00000000b001'
  POLICY='7b000000-0000-4000-8000-00000000d001'
  # The assignment behind the row the New Leads queue opens FIRST — the same subject the mounted
  # certifications already prove reachable.
  QUEUE_FIRST="${CERT_REDUCTION_SUBJECT:-00000000-0000-4000-8000-40000000099b}"
  read -r OCM MEMBER CUSTOMER <<<"$(psql "$DB" -tA -F' ' -c "
    select o.id, o.customer_member_id, m.customer_id
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
    -- REPOINT, do not merely reactivate: a row left from a run against another subject would keep
    -- that household, and the reduction would land on a family the card is not showing.
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
-- A flat, org-scoped discount: what the tenant authored, applied by the server, never by the page.
insert into public.commercial_policies
    (id, org_id, scope_type, policy_type, label, value, effective_start, is_active)
values ('$POLICY', '$ORG', 'org', 'discount', 'Community discount',
        '{"basis":"amount","value":5000,"label":"Community discount"}'::jsonb, '2026-01-01', true)
on conflict (id) do update set value = excluded.value, is_active = true;
SQL
  check $? "an enrolled assignment, an accepted term and an authored discount"

  psql "$DB" -tAc "select count(*) from public.child_enrollment_agreements a
     join public.opportunity_customer_members o on o.id = a.opportunity_customer_member_id
    where a.id = '$AGREEMENT' and o.opportunity_id = '$QUEUE_FIRST' and a.status = 'active'" \
    | grep -q '^1$'
  check $? "the agreement is scoped to the household the browser opens"

  echo "── driving the application"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       CERT_REDUCTION_PERIOD="$PERIOD" CERT_REDUCTION_CUSTOMER="$CUSTOMER" \
       CERT_REDUCTION_SUBJECT="$QUEUE_FIRST" CERT_REDUCTION_ASSIGNMENT="$OCM" \
       CERT_REDUCTION_AGREEMENT="$AGREEMENT" \
       "$PW" test -c playwright.config.ts playwright/financial-reductions.cert.spec.ts --workers=1 --reporter=line )
  check $? "gross and reductions shown apart, human labels, net correct, manual credit recorded"

  # ── AND THE SERVER, NOT THE PAGE, DECIDES WHO MAY REDUCE ────────────────────────────────────
  # Its own run with the grant revoked: one browser session cannot be two operators at once.
  echo "── the same command, with fin.adjust revoked"
  psql "$DB" -q -c "update public.role_permission_grants set allowed = false where permission_key = 'fin.adjust'"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" CERT_EXPECT_UNAUTHORIZED=1 \
       CERT_REDUCTION_PERIOD="$PERIOD" CERT_REDUCTION_CUSTOMER="$CUSTOMER" \
       CERT_REDUCTION_SUBJECT="$QUEUE_FIRST" CERT_REDUCTION_AGREEMENT="$AGREEMENT" \
       "$PW" test -c playwright.config.ts playwright/financial-reductions.cert.spec.ts \
       -g "without the grant" --workers=1 --reporter=line )
  unauthorized=$?
  psql "$DB" -q -c "update public.role_permission_grants set allowed = true where permission_key = 'fin.adjust'"
  check $unauthorized "an unauthorized manual reduction is refused server-side, and records nothing"

  # ── AND IT PUTS THE TENANT BACK ───────────────────────────────────────────────────────────────
  # After the product assertions, never before. A fixture that changes what a neighbouring proof
  # reads is not setup, it is contamination — Thread 7 learned that when its enrolment agreement
  # renamed an unrelated household's charge in Thread 2's smoke.
  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
delete from public.financial_reduction_applications where org_id = '$ORG';
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges
                      where org_id = '$ORG' and charge_category in ('discount', 'credit', 'adjustment'));
delete from public.charges
 where org_id = '$ORG' and charge_category in ('discount', 'credit', 'adjustment');
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges where org_id = '$ORG' and charge_category = 'tuition');
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events
                                 where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges where org_id = '$ORG' and charge_category = 'tuition';
set session_replication_role = default;
delete from public.commercial_policies
 where org_id = '$ORG' and policy_type in ('discount', 'sibling_discount', 'waiver');
delete from public.enrollment_pricing_terms where id = '$TERM';
delete from public.child_enrollment_agreements where id = '$AGREEMENT';
SQL
  check $? "the tenant is left as the browser proof found it"
fi

echo; echo "RESULT: ${pass:-0} passed, ${fail:-0} failed"
[ "${fail:-0}" -eq 0 ]

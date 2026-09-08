#!/usr/bin/env bash
# =============================================================================
# THREAD 9 — SUBSIDY: authorized, claimed, remitted, and what is still missing.
#
# The cases live in web/tests/financials/live/financialSubsidy.live.test.ts. This harness owns what
# they cannot: clearing POSTED money — charges and the agency payments applied to them — between
# runs. Posted money is immutable by design, and that immutability is a guarantee this thread leans
# on; the teardown suspends triggers briefly and only as FIXTURE CLEANUP, exactly as the tuition,
# reductions and responsibility harnesses already do.
#
# It matters more here than anywhere. An agency payment left applied from an earlier run makes a
# charge look already-funded, and a case meaning to prove "an advice is not money" reads $900 of
# money before it starts — green in the wrong direction.
# =============================================================================
set -uo pipefail
pass=0; fail=0
check(){ if [ "$1" -eq 0 ]; then echo "  ✓ $2"; pass=$((pass+1)); else echo "  ✗ $2"; fail=$((fail+1)); fi; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
ORG='00000000-0000-4000-8000-000000000001'
APP="${CERT_APP_URL:-http://localhost:3012}"
PW="$ROOT/web/node_modules/.bin/playwright"

teardown() {
  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
delete from public.financial_subsidy_variances where org_id = '$ORG';
delete from public.financial_subsidy_remittance_lines where org_id = '$ORG';
delete from public.financial_subsidy_remittances where org_id = '$ORG';
delete from public.financial_subsidy_claim_lines where org_id = '$ORG';
delete from public.financial_subsidy_claims where org_id = '$ORG';
delete from public.financial_expected_funding where org_id = '$ORG';
delete from public.financial_subsidy_authorizations where org_id = '$ORG';
delete from public.financial_subsidy_programs where org_id = '$ORG';
delete from public.financial_funding_agencies where org_id = '$ORG';
delete from public.payment_responsibility_attributions where org_id = '$ORG';
delete from public.financial_responsibility_allocations where org_id = '$ORG';
delete from public.financial_responsibility_shares where org_id = '$ORG';
delete from public.financial_responsibility_arrangements where org_id = '$ORG';

set session_replication_role = replica;
delete from public.payment_allocations where org_id = '$ORG';
delete from public.payments where org_id = '$ORG' and billable_source_type = 'enrollment_agreement';
delete from public.financial_reduction_applications where org_id = '$ORG';
-- EVERY entry, not just the charge-sourced ones. A PAYMENT entry survives a charge-scoped delete,
-- and it holds its accounting period frozen — Thread 5 refuses to re-date a period that has
-- reported, correctly, so the fixture period could never be rebuilt and the attribution case could
-- never run twice.
delete from public.financial_journal_entries where org_id = '$ORG';
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events
                                 where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges
 where org_id = '$ORG' and charge_category in ('tuition', 'discount', 'credit', 'adjustment', 'subsidy_offset');
set session_replication_role = default;
-- The fixture accounting period, now that nothing reports into it.
delete from public.financial_accounting_periods
 where org_id = '$ORG' and period_key in ('FY-CERT-SUBSIDY', 'FY2032-P11');
SQL
}

echo "── clearing subsidy, responsibility and the money they describe (posted included, triggers suspended for teardown only)"
teardown
[ $? -eq 0 ] || { echo "✗ teardown failed"; exit 1; }

echo "── the substrate this thread funds"
psql "$DB" -tAc "select count(*) from public.financial_charge_templates where org_id='$ORG' and template_key='tuition' and is_active" \
  | grep -q '^1$' || { echo "✗ no active 'tuition' charge template"; exit 1; }
psql "$DB" -tAc "select count(*) from public.role_permission_grants where permission_key='fin.subsidy'" \
  | grep -qv '^0$' || { echo "✗ fin.subsidy is not granted to any role — the migration has not run"; exit 1; }
psql "$DB" -tAc "select count(*) from pg_constraint where conname='financial_subsidy_authorizations_no_overlap'" \
  | grep -q '^1$' || { echo "✗ the authorization overlap constraint is missing"; exit 1; }

echo "── running the live cases"
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/financialSubsidy.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — authorization, claim, remittance, shortfall, denial, recoupment, concurrency"

if [ "${CERT_BROWSER:-0}" = "1" ]; then
  echo
  echo "── preparing a funded, claimed obligation the card can be asked about"
  PERIOD="${CERT_SUBSIDY_PERIOD:-$(date -u +%Y-%m)}"
  QUEUE_FIRST="${CERT_SUBSIDY_SUBJECT:-00000000-0000-4000-8000-40000000099b}"
  read -r OCM MEMBER CUSTOMER <<<"$(psql "$DB" -tA -F' ' -c "
    select o.id, o.customer_member_id, m.customer_id
      from public.opportunity_customer_members o
      join public.customer_members m on m.id = o.customer_member_id
     where o.org_id = '$ORG' and o.opportunity_id = '$QUEUE_FIRST' limit 1;")"
  PARENT="$(psql "$DB" -tAc "select person_id from public.customer_persons where org_id='$ORG' and customer_id='$CUSTOMER' limit 1")"
  AGREEMENT='6e000000-0000-4000-8000-00000000a001'
  [ -n "${OCM:-}" ] && [ -n "${PARENT:-}" ]
  check $? "a household with a person and an assignment: ${CUSTOMER:-none}"

  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
delete from public.enrollment_pricing_terms where org_id = '$ORG';
insert into public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_customer_member_id, status, start_date)
select '$AGREEMENT', '$ORG', '$MEMBER', '$CUSTOMER',
       (select id from public.locations where org_id = '$ORG' limit 1), '$OCM', 'active', '2026-01-01'
on conflict (id) do update set status = 'active',
    customer_member_id = excluded.customer_member_id, customer_id = excluded.customer_id,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id;
insert into public.enrollment_pricing_terms
    (id, org_id, opportunity_customer_member_id, customer_member_id, enrollment_agreement_id, term_kind,
     source_entity, source_id, recommended_source_id, cadence_key, payer_type, amount_cents, currency_code,
     state, resolution_key, effective_start, accepted_by)
select '6e000000-0000-4000-8000-00000000b001', '$ORG', '$OCM', '$MEMBER', '$AGREEMENT', 'tuition',
       'commercial_tuition_rates', r.id, r.id, 'monthly', 'private_pay', 100000, 'USD',
       'accepted', 'cert-subsidy-browser', '2026-01-01', '00000000-0000-4000-8000-0000000000aa'
  from public.commercial_tuition_rates r where r.org_id = '$ORG' limit 1
on conflict (id) do update set amount_cents = excluded.amount_cents,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id,
    customer_member_id = excluded.customer_member_id, enrollment_agreement_id = excluded.enrollment_agreement_id;
insert into public.financial_responsibility_arrangements (id, org_id, customer_id, effective_start, state)
values ('6e000000-0000-4000-8000-00000000c001', '$ORG', '$CUSTOMER', '2026-01-01', 'active')
on conflict (id) do nothing;
insert into public.financial_responsibility_shares
    (id, org_id, arrangement_id, responsible_party_type, responsible_party_id, method, percent_basis_points, priority)
values ('6e000000-0000-4000-8000-00000000d001', '$ORG', '6e000000-0000-4000-8000-00000000c001', 'person', '$PARENT', 'percentage', 10000, 1)
on conflict (arrangement_id, responsible_party_id) do nothing;
-- Expected funding anchored to the SHARE, which is how a tenant says "this agency covers most of
-- this parent's share every month" rather than re-entering it per period. The browser proof then
-- only has to drive the subsidy commands themselves.
-- (No dollar figures in this heredoc: it is unquoted, so bash would expand a positional like the
-- 9 in a nine-hundred-dollar amount and silently truncate the SQL.)
insert into public.financial_expected_funding
    (org_id, arrangement_id, share_id, funding_source_type, funding_source_label, basis, expected_amount_cents, state, idempotency_key)
values ('$ORG', '6e000000-0000-4000-8000-00000000c001', '6e000000-0000-4000-8000-00000000d001',
        'government_subsidy', 'State Child Care Assistance', 'fixed_amount', 90000, 'active', 'fef:cert-browser-subsidy')
on conflict (org_id, idempotency_key) do update set expected_amount_cents = excluded.expected_amount_cents;
SQL
  check $? "an accepted term and a single responsible party"

  echo "── driving the application"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       CERT_SUBSIDY_PERIOD="$PERIOD" CERT_SUBSIDY_CUSTOMER="$CUSTOMER" CERT_SUBSIDY_ASSIGNMENT="$OCM" \
       CERT_SUBSIDY_MEMBER="$MEMBER" \
       "$PW" test -c playwright.config.ts playwright/financial-subsidy.cert.spec.ts --workers=1 --reporter=line )
  check $? "expected subsidy shown, submitted claim suppresses collection, outstanding unmoved"

  echo "── the same command, with fin.subsidy revoked"
  psql "$DB" -q -c "update public.role_permission_grants set allowed = false where permission_key = 'fin.subsidy'"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" CERT_EXPECT_UNAUTHORIZED=1 \
       CERT_SUBSIDY_CUSTOMER="$CUSTOMER" CERT_SUBSIDY_MEMBER="$MEMBER" \
       "$PW" test -c playwright.config.ts playwright/financial-subsidy.cert.spec.ts \
       -g "without the grant" --workers=1 --reporter=line )
  unauthorized=$?
  psql "$DB" -q -c "update public.role_permission_grants set allowed = true where permission_key = 'fin.subsidy'"
  check $unauthorized "recording an authorization is refused server-side, and records nothing"

  teardown
  psql "$DB" -q -c "delete from public.enrollment_pricing_terms where org_id='$ORG'; delete from public.child_enrollment_agreements where id = '$AGREEMENT';"
  check $? "the tenant is left as the browser proof found it"
fi

echo; echo "RESULT: ${pass:-0} passed, ${fail:-0} failed"
[ "${fail:-0}" -eq 0 ]

#!/usr/bin/env bash
# =============================================================================
# THREAD 6 — RESPONSIBILITY + FUNDING: who owes it, and where their share is funded from.
#
# The cases live in web/tests/financials/live/financialResponsibility.live.test.ts and run against
# the real certification database. This harness owns the one thing they cannot: clearing POSTED
# money between runs.
#
# That matters more here than anywhere else in the programme. A posted tuition charge left by an
# earlier run is correctly REFUSED by Thread 7's generator and correctly refuses background
# reallocation in Thread 6 — so a case meaning to exercise the DRAFT path silently exercises the
# posted one and asserts the wrong behaviour while looking green. The teardown suspends triggers
# deliberately and briefly, exactly as the tuition-generation and reductions harnesses already do,
# and it is fixture cleanup only: the immutability of posted money is a product guarantee this
# thread asserts and does not relax.
#
# Usage:  certification/financials/financial-responsibility.cert.sh   [CERT_BROWSER=1]
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
-- Consequences before the things they point at: allocations hold arrangements by RESTRICT, because
-- an arrangement that produced money must not be deletable out from under it.
delete from public.payment_responsibility_attributions where org_id = '$ORG';
delete from public.financial_expected_funding where org_id = '$ORG';
delete from public.financial_responsibility_allocations where org_id = '$ORG';
delete from public.financial_responsibility_shares where org_id = '$ORG';
delete from public.financial_responsibility_arrangements where org_id = '$ORG';
delete from public.commercial_policies
 where org_id = '$ORG' and policy_type in ('discount', 'sibling_discount', 'waiver');

set session_replication_role = replica;
delete from public.payment_allocations where org_id = '$ORG';
delete from public.payments where org_id = '$ORG' and billable_source_type = 'enrollment_agreement';
delete from public.financial_reduction_applications where org_id = '$ORG';
delete from public.financial_journal_entries
 where org_id = '$ORG'
   and source_id in (select id from public.charges where org_id = '$ORG');
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events
                                 where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges
 where org_id = '$ORG' and charge_category in ('tuition', 'discount', 'credit', 'adjustment');
set session_replication_role = default;
SQL
}

echo "── clearing responsibility, funding and the money it divides (posted included, triggers suspended for teardown only)"
teardown
[ $? -eq 0 ] || { echo "✗ teardown failed"; exit 1; }

echo "── the substrate this thread divides"
psql "$DB" -tAc "select count(*) from public.financial_charge_templates where org_id='$ORG' and template_key='tuition' and is_active" \
  | grep -q '^1$' || { echo "✗ no active 'tuition' charge template — Thread 7's gross cannot be generated"; exit 1; }
psql "$DB" -tAc "select count(*) from public.role_permission_grants where permission_key='fin.responsibility'" \
  | grep -qv '^0$' || { echo "✗ fin.responsibility is not granted to any role — the migration has not run"; exit 1; }
psql "$DB" -tAc "select count(*) from pg_constraint where conname='financial_responsibility_arrangements_no_overlap'" \
  | grep -q '^1$' || { echo "✗ the overlap exclusion constraint is missing"; exit 1; }

echo "── running the live cases"
# The exit status is the RUNNER'S, not the pipeline's.
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/financialResponsibility.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — splits, the unassigned gap, dating, posting, payment, funding, concurrency"

if [ "${CERT_BROWSER:-0}" = "1" ]; then
  echo
  echo "── preparing an enrolled child, an accepted term and a 70/30 arrangement"
  PERIOD="${CERT_RESP_PERIOD:-$(date -u +%Y-%m)}"
  AGREEMENT='6c000000-0000-4000-8000-00000000a001'
  TERM='6c000000-0000-4000-8000-00000000b001'
  ARRANGEMENT='6c000000-0000-4000-8000-00000000c001'
  QUEUE_FIRST="${CERT_RESP_SUBJECT:-00000000-0000-4000-8000-40000000099b}"
  read -r OCM MEMBER CUSTOMER <<<"$(psql "$DB" -tA -F' ' -c "
    select o.id, o.customer_member_id, m.customer_id
      from public.opportunity_customer_members o
      join public.customer_members m on m.id = o.customer_member_id
     where o.org_id = '$ORG' and o.opportunity_id = '$QUEUE_FIRST' limit 1;")"
  read -r ALEX SAM <<<"$(psql "$DB" -tA -F' ' -c "
    select string_agg(person_id::text, ' ' order by person_id)
      from (select distinct person_id from public.customer_persons
             where org_id = '$ORG' and customer_id = '$CUSTOMER' limit 2) p;")"
  [ -n "${OCM:-}" ] && [ -n "${ALEX:-}" ] && [ -n "${SAM:-}" ]
  check $? "a household with two people and an assignment: ${CUSTOMER:-none}"

  psql "$DB" -q -v ON_ERROR_STOP=1 <<SQL
delete from public.enrollment_pricing_terms where org_id = '$ORG';
insert into public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_customer_member_id, status, start_date)
select '$AGREEMENT', '$ORG', '$MEMBER', '$CUSTOMER',
       (select id from public.locations where org_id = '$ORG' limit 1), '$OCM', 'active', '2026-01-01'
on conflict (id) do update set
    status = 'active',
    customer_member_id = excluded.customer_member_id,
    customer_id = excluded.customer_id,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id;
insert into public.enrollment_pricing_terms
    (id, org_id, opportunity_customer_member_id, customer_member_id, enrollment_agreement_id, term_kind,
     source_entity, source_id, recommended_source_id, cadence_key, payer_type, amount_cents, currency_code,
     state, override_reason, resolution_key, effective_start, accepted_by)
select '$TERM', '$ORG', '$OCM', '$MEMBER', '$AGREEMENT', 'tuition',
       'commercial_tuition_rates', r.id, r.id, 'monthly', 'private_pay', 100000, 'USD',
       'overridden', 'Certification fixture', 'cert-responsibility', '2026-01-01',
       '00000000-0000-4000-8000-0000000000aa'
  from public.commercial_tuition_rates r where r.org_id = '$ORG' limit 1
on conflict (id) do update set
    amount_cents = excluded.amount_cents,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id,
    customer_member_id = excluded.customer_member_id,
    enrollment_agreement_id = excluded.enrollment_agreement_id;
-- 70/30 between two NAMED people. The browser proof reads this back; nothing infers it.
insert into public.financial_responsibility_arrangements
    (id, org_id, customer_id, effective_start, state)
values ('$ARRANGEMENT', '$ORG', '$CUSTOMER', '2026-01-01', 'active')
on conflict (id) do nothing;
insert into public.financial_responsibility_shares
    (org_id, arrangement_id, responsible_party_type, responsible_party_id, method, percent_basis_points, priority)
values ('$ORG', '$ARRANGEMENT', 'person', '$ALEX', 'percentage', 7000, 1),
       ('$ORG', '$ARRANGEMENT', 'person', '$SAM', 'percentage', 3000, 2)
on conflict (arrangement_id, responsible_party_id) do nothing;
SQL
  check $? "an accepted term and a 70/30 arrangement between two named people"

  echo "── driving the application"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       CERT_RESP_PERIOD="$PERIOD" CERT_RESP_CUSTOMER="$CUSTOMER" CERT_RESP_ASSIGNMENT="$OCM" \
       CERT_RESP_ALEX="$ALEX" CERT_RESP_SAM="$SAM" \
       "$PW" test -c playwright.config.ts playwright/financial-responsibility.cert.spec.ts --workers=1 --reporter=line )
  check $? "persisted responsibility visible, unassigned truthful, actual payer distinct, no fabricated shares"

  echo "── the same command, with fin.responsibility revoked"
  psql "$DB" -q -c "update public.role_permission_grants set allowed = false where permission_key = 'fin.responsibility'"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" CERT_EXPECT_UNAUTHORIZED=1 \
       CERT_RESP_CUSTOMER="$CUSTOMER" CERT_RESP_ALEX="$ALEX" \
       "$PW" test -c playwright.config.ts playwright/financial-responsibility.cert.spec.ts \
       -g "without the grant" --workers=1 --reporter=line )
  unauthorized=$?
  psql "$DB" -q -c "update public.role_permission_grants set allowed = true where permission_key = 'fin.responsibility'"
  check $unauthorized "configuring responsibility is refused server-side, and records nothing"

  # AND IT PUTS THE TENANT BACK — after the product assertions, never before.
  teardown
  psql "$DB" -q -c "delete from public.enrollment_pricing_terms where id = '$TERM'; delete from public.child_enrollment_agreements where id = '$AGREEMENT';"
  check $? "the tenant is left as the browser proof found it"
fi

echo; echo "RESULT: ${pass:-0} passed, ${fail:-0} failed"
[ "${fail:-0}" -eq 0 ]

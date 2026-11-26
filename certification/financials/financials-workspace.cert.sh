#!/usr/bin/env bash
# =============================================================================
# THREADS 4 + 4A — FINANCIALS WORKSPACE: navigation, composition, projection, money, action.
#
# Thread 4's live cases prove the projection SELECTS and scopes truthfully. Thread 4A's prove the
# thing Thread 4 deliberately had none of — figures — and the property that makes them safe: every
# total is `computeCollectiblePosition`, the same arithmetic the account card renders, asserted
# against `resolveFamilyCollectible` on the same charge rather than against a number written into
# a test.
#
# The browser proofs drive the operator path end to end, and the shared-chrome proof runs across
# EVERY workspace, because the Expand removal and the one-line header band were repairs to shared
# primitives — proving them in Financials alone would prove nothing about the other four.
#
# This harness owns what none of them can: clearing POSTED money between runs, so a cohort that
# should contain draft work is not empty because an earlier run already posted it.
#
# The trigger suspension is fixture cleanup only. Posted money is immutable by design, and this
# thread asserts that immutability rather than relaxing it.
# =============================================================================
set -uo pipefail
pass=0; fail=0
check(){ if [ "$1" -eq 0 ]; then echo "  ✓ $2"; pass=$((pass+1)); else echo "  ✗ $2"; fail=$((fail+1)); fi; }
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
ORG='00000000-0000-4000-8000-000000000001'
APP="${CERT_APP_URL:-http://localhost:3012}"
PW="$ROOT/web/node_modules/.bin/playwright"

# ── THE DATABASE CLIENT LIVES IN THE DATABASE ────────────────────────────────────────────────
#
# This harness shelled out to a host `psql` for every one of its nine SQL steps, and this host
# has none — not on PATH, not in Homebrew. The Runtime lane hit the identical defect in
# `alloy-certify` and fixed it there; the same seam is used here rather than a different one,
# because two certification paths disagreeing about how to reach the same database is how one of
# them silently stops being run.
#
# Requiring an operator to install a Postgres client before Alloy can certify itself is not a
# fix: the sanctioned stack already ships a psql inside `supabase_db_<project>`, and that client
# is by definition the right version for that database. Host client when there is one, the
# stack's own client otherwise — with the connection rebuilt for the container's own loopback
# (5432, not the host's published port) while keeping the credentials and database the stack
# itself reported.
cert_db_container() { printf 'supabase_db_%s\n' "$(sed -n 's/^[[:space:]]*project_id[[:space:]]*=[[:space:]]*"\{0,1\}\([^"]*\)"\{0,1\}.*/\1/p' "$ROOT/certification/supabase/config.toml" 2>/dev/null | head -1)"; }
cert_db_url_incontainer() { printf '%s\n' "$1" | sed -E 's#^(postgresql://[^@]+@)[^/]+(/.*)$#\1127.0.0.1:5432\2#'; }

# `pg <psql-args…>` — the connection is this harness's `$DB`, wherever the client happens to be.
# stdin is forwarded, so the heredoc call sites keep working unchanged.
pg() {
  if command -v psql >/dev/null 2>&1; then psql "$DB" "$@"; return $?; fi
  docker exec -i "$(cert_db_container)" psql "$(cert_db_url_incontainer "$DB")" "$@"
}

teardown() {
  pg -q -v ON_ERROR_STOP=1 <<SQL
set session_replication_role = replica;
delete from public.payment_responsibility_attributions where org_id = '$ORG';
delete from public.payment_allocations where org_id = '$ORG';
delete from public.payments where org_id = '$ORG' and billable_source_type in ('enrollment_agreement', 'customer');
delete from public.financial_responsibility_allocations where org_id = '$ORG';
delete from public.financial_reduction_applications where org_id = '$ORG';
delete from public.financial_journal_entries where org_id = '$ORG';
delete from public.resolved_obligations
 where consumption_event_id in (select id from public.consumption_events
                                 where org_id = '$ORG' and idempotency_key like 'cev:tuition:%');
delete from public.consumption_events where org_id = '$ORG' and idempotency_key like 'cev:tuition:%';
delete from public.charges where org_id = '$ORG' and billable_source_type in ('enrollment_agreement', 'customer');
set session_replication_role = default;
SQL
}

echo "── clearing the money the workspace projects over (posted included, triggers suspended for teardown only)"
teardown
[ $? -eq 0 ] || { echo "✗ teardown failed"; exit 1; }

echo "── the substrate this workspace lists"
pg -tAc "select count(*) from public.financial_charge_templates where org_id='$ORG' and template_key='tuition' and is_active" \
  | grep -q '^1$' || { echo "✗ no active 'tuition' charge template"; exit 1; }
pg -tAc "select count(*) from public.locations where org_id='$ORG' and location_type='site'" \
  | grep -qvE '^(0|1)$' || { echo "✗ two sites are needed to prove location scope"; exit 1; }

echo "── the accounting calendar the history cases depend on"
# Thread 5's attribution trigger REFUSES a journal entry whose effective date falls outside every
# period on the active calendar. A run whose service period sits outside it would post charges and
# silently record no history, so the productization cases would assert nothing at all.
pg -tAc "select count(*) from public.financial_accounting_periods p
                   join public.financial_accounting_calendars c on c.id = p.calendar_id
                  where c.org_id = '$ORG' and c.is_active" \
  | grep -qv '^0$' || { echo "✗ the active calendar has no periods; history cannot be attributed"; exit 1; }

echo "── running the live cases (Thread 4: selection and scope)"
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/financialWorkspaceQueue.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — cohort, location provenance, site scope, restriction, posting, isolation"

teardown

echo "── running the live cases (Thread 4A: position, payments, history, metrics)"
( cd "$ROOT/web" && npx vitest run \
    tests/financials/live/financialsWorkspaceProductization.live.test.ts \
    --no-file-parallelism 2>&1 | tail -30; exit "${PIPESTATUS[0]}" )
check $? "the live cases — canonical agreement, site scope, unapplied money, history, metric parity"

echo "── the hermetic cases the projections and the composition rest on"
( cd "$ROOT/web" && npx vitest run \
    tests/financials/subsidy/collectiblePosition.test.ts \
    tests/financials/workspace/financialPositionCohort.test.ts \
    tests/financials/workspace/financialWorkLocation.test.ts \
    tests/financials/workspace/financialsWorkspaceComposition.test.ts \
    tests/adminV2/scheduling/assignmentsWorkspaceRuntimeConvergence.test.ts \
    2>&1 | tail -12; exit "${PIPESTATUS[0]}" )
check $? "one calculation, one location contract, one shell family, no Expand"

if [ "${CERT_BROWSER:-0}" = "1" ]; then
  echo
  #
  # ── THE WORKSPACE NEEDS A TENANT TO BE A WORKSPACE ABOUT ────────────────────────────────────
  #
  # `teardown` above is right for the invariant proofs — a cohort assertion against leftovers
  # proves nothing — but it leaves the org with no money at all, and the browser proof that ran
  # next was therefore certifying an empty product. That is why the Financials screenshots look
  # like empty shells: the sections render lists correctly, and there was nothing to list.
  #
  # So the representative tenant is installed HERE, after the invariant proofs have had their
  # clean slate and before anything mounted is asserted. One seam, and it fails loudly.
  # shellcheck source=certification/financials/demo-tenant.sh
  . "$ROOT/certification/financials/demo-tenant.sh"
  seed_demo_tenant || { echo "✗ representative tenant could not be built"; exit 1; }
  check $? "a representative tenant: four households, two campuses, money the resolver can see"

  echo
  echo "── preparing a draft charge the workspace can list and post"
  PERIOD="${CERT_WS_PERIOD:-$(date -u +%Y-%m)}"
  QUEUE_FIRST="${CERT_WS_SUBJECT:-00000000-0000-4000-8000-40000000099b}"
  AGREEMENT='6f000000-0000-4000-8000-00000000c001'
  read -r OCM MEMBER CUSTOMER <<<"$(pg -tA -F' ' -c "
    select o.id, o.customer_member_id, m.customer_id
      from public.opportunity_customer_members o
      join public.customer_members m on m.id = o.customer_member_id
     where o.org_id = '$ORG' and o.opportunity_id = '$QUEUE_FIRST' limit 1;")"
  SITE="$(pg -tAc "select id from public.locations where org_id='$ORG' and location_type='site' order by id limit 1")"
  [ -n "${OCM:-}" ] && [ -n "${SITE:-}" ]
  check $? "an assignment and a site: ${CUSTOMER:-none}"

  pg -q -v ON_ERROR_STOP=1 <<SQL
delete from public.enrollment_pricing_terms where org_id = '$ORG';
insert into public.child_enrollment_agreements
    (id, org_id, customer_member_id, customer_id, site_location_id, opportunity_customer_member_id, status, start_date)
values ('$AGREEMENT', '$ORG', '$MEMBER', '$CUSTOMER', '$SITE', '$OCM', 'active', '2026-01-01')
on conflict (id) do update set status = 'active', site_location_id = excluded.site_location_id,
    customer_member_id = excluded.customer_member_id, customer_id = excluded.customer_id,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id;
insert into public.enrollment_pricing_terms
    (id, org_id, opportunity_customer_member_id, customer_member_id, enrollment_agreement_id, term_kind,
     source_entity, source_id, recommended_source_id, cadence_key, payer_type, amount_cents, currency_code,
     state, resolution_key, effective_start, accepted_by)
select '6f000000-0000-4000-8000-00000000d001', '$ORG', '$OCM', '$MEMBER', '$AGREEMENT', 'tuition',
       'commercial_tuition_rates', r.id, r.id, 'monthly', 'private_pay', 121000, 'USD',
       'accepted', 'cert-workspace-browser', '2026-01-01', '00000000-0000-4000-8000-0000000000aa'
  from public.commercial_tuition_rates r where r.org_id = '$ORG' limit 1
on conflict (id) do update set amount_cents = excluded.amount_cents,
    opportunity_customer_member_id = excluded.opportunity_customer_member_id,
    customer_member_id = excluded.customer_member_id, enrollment_agreement_id = excluded.enrollment_agreement_id;
SQL
  check $? "an enrolled assignment at a real site, with an accepted term"

  echo "── driving the application"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       CERT_WS_PERIOD="$PERIOD" CERT_WS_CUSTOMER="$CUSTOMER" CERT_WS_ASSIGNMENT="$OCM" \
       CERT_WS_MEMBER="$MEMBER" CERT_WS_SITE="$SITE" \
       "$PW" test -c playwright.config.ts playwright/financials-workspace.cert.spec.ts --workers=1 --reporter=line )
  check $? "navigation, shell, money overview, sections, Studio, bulk preview, queue, Thread 2 detail, posting, reload"

  #
  # ── THE DENSITY PROOF ────────────────────────────────────────────────────────────────────────
  #
  # The suite above proves STRUCTURE and passes against an empty Financials. This one proves the
  # workspace has a financial day in it, and is written to FAIL against the empty tenant the old
  # screenshots showed. Both are kept: structure catches architectural regressions, density catches
  # the product quietly becoming six white canvases again.
  echo
  echo "── the product, with money in it"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       "$PW" test -c playwright.config.ts playwright/financials-density.cert.spec.ts --workers=1 --reporter=line )
  check $? "populated Overview, Accounts, Charges, Payments, Subsidy, Activity, Studio, site narrowing, cold reload"

  echo "── the shared chrome, in every workspace that wears it"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" \
       "$PW" test -c playwright.config.ts playwright/workspace-chrome.cert.spec.ts --workers=1 --reporter=line )
  check $? "no Expand, a reachable Close, a one-line header band and a readable site filter — everywhere"

  # `fin.read` is the permission THIS thread's server surface owns. Thread 1's `charge.post`
  # declares none — it is gated by the admin/ops route gate — which is reported as a finding rather
  # than patched from a workspace that has no business changing another thread's action contract.
  echo "── the same read, with fin.read revoked"
  pg -q -c "update public.role_permission_grants set allowed = false where permission_key = 'fin.read'"
  ( cd "$ROOT/certification" \
    && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" CERT_EXPECT_UNAUTHORIZED=1 \
       CERT_WS_CUSTOMER="$CUSTOMER" CERT_WS_MEMBER="$MEMBER" \
       "$PW" test -c playwright.config.ts playwright/financials-workspace.cert.spec.ts playwright/financials-density.cert.spec.ts \
       -g "without the grant|in business language" --workers=1 --reporter=line )
  unauthorized=$?
  pg -q -c "update public.role_permission_grants set allowed = true where permission_key = 'fin.read'"
  check $unauthorized "handing over financial work is refused server-side without fin.read"

  #
  # ── LEFT DEMO-READY, NOT LEFT EMPTY ─────────────────────────────────────────────────────────
  #
  # This used to end by deleting every enrolment- and customer-sourced charge in the org, so the
  # tenant a human opened AFTER a certification run had nothing in it. The proof cleaned up after
  # itself and took the product with it.
  #
  # The proof's OWN subject still goes — it is scaffolding — but the representative tenant is
  # rebuilt, so the next person to open Financials sees the product rather than its skeleton.
  teardown
  pg -q -c "delete from public.enrollment_pricing_terms where org_id='$ORG'; delete from public.child_enrollment_agreements where id = '$AGREEMENT';"
  check $? "the browser proof's own scaffolding is removed"
  seed_demo_tenant >/dev/null 2>&1
  check $? "the tenant is left demo-ready, not empty"
fi

echo; echo "RESULT: ${pass:-0} passed, ${fail:-0} failed"
[ "${fail:-0}" -eq 0 ]

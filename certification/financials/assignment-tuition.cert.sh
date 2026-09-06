#!/usr/bin/env bash
# =============================================================================
# ASSIGNMENT → TUITION, in the mounted application.
#
# The browser cases live in certification/playwright/assignment-tuition.cert.spec.ts. This harness
# owns the parts a browser session cannot own: moving an assignment fact at its owner, and being a
# second operator without the override grant.
#
# It does not touch pricing. Every tuition read, recommendation, acceptance and override in the
# proof happens in the application, through the canonical resolver and the registered actions.
# =============================================================================
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${CERT_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54422/postgres}"
APP="${CERT_APP_URL:-http://localhost:3012}"
PW="$ROOT/web/node_modules/.bin/playwright"
SPEC="playwright/assignment-tuition.cert.spec.ts"
SCRATCH="${CERT_SCRATCH:-/tmp}"
ORG='00000000-0000-4000-8000-000000000001'

pass=0; fail=0
step() { echo; echo "── $1"; }
run()  { ( cd "$ROOT/certification" && NODE_PATH="$ROOT/web/node_modules" CERT_APP_URL="$APP" "$@" ); }
check(){ if [ "$1" -eq 0 ]; then echo "  ✓ $2"; pass=$((pass+1)); else echo "  ✗ $2"; fail=$((fail+1)); fi; }

step "A–E, M · resolve, accept, reload, retry"
psql "$DB" -q -c "delete from public.enrollment_pricing_terms;"
run "$PW" test -c playwright.config.ts "$SPEC" -g "resolve, accept, reload, and a retry" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the mounted card resolves, accepts, survives a reload, and a retry adds no term"

step "F · the assignment moves, at its owner"
run env CERT_EXPECT_STALE=0 CERT_TUITION_OUT="$SCRATCH/tuition-before.json" \
    "$PW" test -c playwright.config.ts "$SPEC" -g "goes stale when the assignment moves" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the assignment reads as five days, and its accepted tuition is current"
BEFORE_AMOUNT=$(python3 -c "import json;print(json.load(open('$SCRATCH/tuition-before.json'))['amount'])" 2>/dev/null || echo "")
BEFORE_RES=$(python3 -c "import json;print(json.load(open('$SCRATCH/tuition-before.json'))['resolution'])" 2>/dev/null || echo "")
# The OWNER of days a week is the assignment row. The participation editor route would be the
# nicer path and is unusable here: it requires an enrollment process instance, and the
# representative tenant has none.
psql "$DB" -q -c "update public.opportunity_customer_members
                     set metadata = metadata || '{\"requested_days_per_week\": 3}'::jsonb
                   where org_id = '$ORG'
                     and id = (select opportunity_customer_member_id from public.enrollment_pricing_terms limit 1);"
check $? "days a week changed from five to three at the assignment"

step "G–H · the prior resolution is stale, and the new one is right"
run env CERT_EXPECT_STALE=1 CERT_PRIOR_AMOUNT="$BEFORE_AMOUNT" CERT_PRIOR_RESOLUTION="$BEFORE_RES" \
    CERT_TUITION_OUT="$SCRATCH/tuition-after.json" \
    "$PW" test -c playwright.config.ts "$SPEC" -g "goes stale when the assignment moves" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the card marks the accepted term stale and recommends the three-day rate"

psql "$DB" -q -c "update public.opportunity_customer_members
                     set metadata = metadata || '{\"requested_days_per_week\": 5}'::jsonb
                   where org_id = '$ORG'
                     and id = (select opportunity_customer_member_id from public.enrollment_pricing_terms limit 1);"

step "J · an unpriced assignment"
run "$PW" test -c playwright.config.ts "$SPEC" -g "unpriced assignment says so" --workers=1 --reporter=line >/dev/null 2>&1
check $? "a drop-in assignment says no configured tuition applies"

step "I · an ambiguous catalog"
# A second billing cadence for the same variant: two configured options apply equally, and the card
# passes no chosen cadence. Ordinary configuration, and a real tie.
psql "$DB" -q -c "insert into public.commercial_tuition_rates
                      (id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start)
                  select '00000000-0000-4000-8000-0000000bff01'::uuid, org_id, location_id, variant_id, 'weekly', payer_type,
                         42000, true, false, effective_start
                    from public.commercial_tuition_rates
                   where id = '00000000-0000-4000-8000-0000000b0001'
                  on conflict (id) do nothing;"
run env CERT_EXPECT_AMBIGUOUS=1 "$PW" test -c playwright.config.ts "$SPEC" -g "ambiguous catalog offers the options" --workers=1 --reporter=line >/dev/null 2>&1
check $? "two equally-applicable options are offered, and none is selected"
psql "$DB" -q -c "delete from public.commercial_tuition_rates where id = '00000000-0000-4000-8000-0000000bff01';"

step "K · an authorized override"
run "$PW" test -c playwright.config.ts "$SPEC" -g "authorized override keeps the recommendation" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the override needs a reason, keeps the recommendation, and survives a reload"

step "L · an UNAUTHORIZED override is refused by the server"
psql "$DB" -q -c "update public.role_permission_grants set allowed = false
                   where org_id='$ORG' and permission_key='enrollment.pricing.override';"
run env CERT_EXPECT_UNAUTHORIZED=1 "$PW" test -c playwright.config.ts "$SPEC" -g "the server refuses the override" --workers=1 --reporter=line >/dev/null 2>&1
check $? "with the grant revoked, the override is refused server-side"
psql "$DB" -q -c "update public.role_permission_grants set allowed = true
                   where org_id='$ORG' and permission_key='enrollment.pricing.override';"

echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]

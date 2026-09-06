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
# A known starting tenant: no accepted terms, seeded day-counts, no stray cadences, grant restored.
psql "$DB" -q -c "delete from public.enrollment_pricing_terms;" \
                -c "delete from public.commercial_tuition_rates where org_id = '$ORG' and cadence_key <> 'monthly';" \
                -c "update public.role_permission_grants set allowed = true where permission_key = 'enrollment.pricing.override';" \
                -c "update public.opportunity_customer_members
                       set metadata = metadata || jsonb_build_object('requested_days_per_week',
                           case schedule_type when 'full_time' then 5 when 'part_time' then 3 else 2 end)
                     where org_id = '$ORG';"
run "$PW" test -c playwright.config.ts "$SPEC" -g "resolve, accept, reload, and a retry" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the mounted card resolves, accepts, survives a reload, and a retry adds no term"

step "F · the assignment moves, at its owner"
run env CERT_EXPECT_STALE=0 CERT_TUITION_OUT="$SCRATCH/tuition-before.json" \
    "$PW" test -c playwright.config.ts "$SPEC" -g "goes stale when the assignment moves" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the assignment reads as five days, and its accepted tuition is current"
BEFORE_AMOUNT=$(python3 -c "import json;print(json.load(open('$SCRATCH/tuition-before.json'))['amount'])" 2>/dev/null || echo "")
BEFORE_RES=$(python3 -c "import json;print(json.load(open('$SCRATCH/tuition-before.json'))['resolution'])" 2>/dev/null || echo "")
BEFORE_DAYS=$(python3 -c "import json;print(json.load(open('$SCRATCH/tuition-before.json'))['days'])" 2>/dev/null || echo "")
# The OWNER of days a week is the assignment row. The participation editor route would be the nicer
# path and is unusable in this tenant: it routes every participation field through the child's
# enrollment process instance, and there are none. Recorded, not worked around.
#
# The change FLIPS between the two day-counts the catalog sells for this offering, so the answer
# re-prices rather than falling off the catalog — and the original is restored afterwards.
SUBJECT=$(psql "$DB" -tAc "select opportunity_customer_member_id from public.enrollment_pricing_terms where superseded_at is null limit 1")
ORIG_DAYS=$(psql "$DB" -tAc "select metadata->>'requested_days_per_week' from public.opportunity_customer_members where id = '$SUBJECT'")
NEW_DAYS=$([ "$ORIG_DAYS" = "5" ] && echo 3 || echo 5)
psql "$DB" -q -c "update public.opportunity_customer_members
                     set metadata = metadata || jsonb_build_object('requested_days_per_week', $NEW_DAYS)
                   where org_id = '$ORG' and id = '$SUBJECT';"
check $? "days a week changed from $ORIG_DAYS to $NEW_DAYS at the assignment"

step "G–H · the prior resolution is stale, and the new one is right"
run env CERT_EXPECT_STALE=1 CERT_PRIOR_AMOUNT="$BEFORE_AMOUNT" CERT_PRIOR_RESOLUTION="$BEFORE_RES" CERT_PRIOR_DAYS="$BEFORE_DAYS" \
    CERT_TUITION_OUT="$SCRATCH/tuition-after.json" \
    "$PW" test -c playwright.config.ts "$SPEC" -g "goes stale when the assignment moves" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the card marks the accepted term stale and recommends the three-day rate"

psql "$DB" -q -c "update public.opportunity_customer_members
                     set metadata = metadata || jsonb_build_object('requested_days_per_week', $ORIG_DAYS)
                   where org_id = '$ORG' and id = '$SUBJECT';"

step "J · an unpriced assignment"
run "$PW" test -c playwright.config.ts "$SPEC" -g "unpriced assignment says so" --workers=1 --reporter=line >/dev/null 2>&1
check $? "a drop-in assignment says no configured tuition applies"

step "I · an ambiguous catalog"
# A second billing cadence beside every monthly one: two configured options then apply equally to
# whichever assignment the queue offers, and the card passes NO chosen cadence. Ordinary
# configuration, and a real tie — not two identical variants, which the schema already forbids.
psql "$DB" -q -c "insert into public.commercial_tuition_rates
                      (id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start)
                  select ('00000000-0000-4000-8000-0000000bff' || lpad(to_hex(row_number() over (order by id))::text, 2, '0'))::uuid,
                         org_id, location_id, variant_id, 'weekly', payer_type,
                         (rate_cents / 4)::int, true, false, effective_start
                    from public.commercial_tuition_rates
                   where org_id = '$ORG' and cadence_key = 'monthly'
                  on conflict do nothing;"
run env CERT_EXPECT_AMBIGUOUS=1 "$PW" test -c playwright.config.ts "$SPEC" -g "ambiguous catalog offers the options" --workers=1 --reporter=line >/dev/null 2>&1
check $? "two equally-applicable options are offered, and none is selected"
psql "$DB" -q -c "delete from public.commercial_tuition_rates where org_id = '$ORG' and cadence_key = 'weekly';"

step "K · an authorized override"
# An override needs a recommendation AND another authored option that applies. A SITE-scoped rate
# beside the organisation default is exactly that: the site rate supersedes and is recommended, and
# the org default remains applicable — which is what the operator overrides TO.
SUBJECT=$(psql "$DB" -tAc "select opportunity_customer_member_id from public.enrollment_pricing_terms where superseded_at is null limit 1")
VARIANT=$(psql "$DB" -tAc "select variant_id from public.enrollment_pricing_terms where opportunity_customer_member_id = '$SUBJECT' and superseded_at is null limit 1")
SITE=$(psql "$DB" -tAc "select location_id from public.opportunity_customer_members where id = '$SUBJECT'")
psql "$DB" -q -c "insert into public.commercial_tuition_rates
                      (id, org_id, location_id, variant_id, cadence_key, payer_type, rate_cents, is_active, not_offered, effective_start)
                  values ('00000000-0000-4000-8000-0000000bfe01'::uuid, '$ORG', '$SITE', '$VARIANT', 'monthly', 'private_pay',
                          177000, true, false, current_date - 365)
                  on conflict (id) do update set is_active = true, not_offered = false;"
run "$PW" test -c playwright.config.ts "$SPEC" -g "authorized override keeps the recommendation" --workers=1 --reporter=line >/dev/null 2>&1
check $? "the override needs a reason, keeps the recommendation, and survives a reload"

step "L · an UNAUTHORIZED override is refused by the server"
psql "$DB" -q -c "update public.role_permission_grants set allowed = false
                   where org_id='$ORG' and permission_key='enrollment.pricing.override';"
run env CERT_EXPECT_UNAUTHORIZED=1 "$PW" test -c playwright.config.ts "$SPEC" -g "the server refuses the override" --workers=1 --reporter=line >/dev/null 2>&1
check $? "with the grant revoked, the override is refused server-side"
psql "$DB" -q -c "update public.role_permission_grants set allowed = true
                   where org_id='$ORG' and permission_key='enrollment.pricing.override';"
psql "$DB" -q -c "delete from public.commercial_tuition_rates where id = '00000000-0000-4000-8000-0000000bfe01';"

echo; echo "RESULT: $pass passed, $fail failed"
[ "$fail" -eq 0 ]

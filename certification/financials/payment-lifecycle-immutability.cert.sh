#!/usr/bin/env bash
# =============================================================================
# THREAD 8B SLICE B — F1/F2: the LIFECYCLE of a posted childcare receipt is immutable.
#
# `20260903190000` froze what a posted childcare payment is worth and left three fields that decide
# whether it COUNTS: `paid_at`, `status_key`, `payment_status_id`. It also blocked a posted receipt
# from reverting only to `pending` or `failed`, leaving `voided` open — and `voided` is the dangerous
# one, because a status-key vocabulary reaches it by accident (`canceled` maps onto it) and because
# the balance rule counts `status = 'posted'`: voiding in place erases the money from the balance
# while the row and its applications survive.
#
# These are database claims, so they are proven against real Postgres and not against a mock.
#
#   L1  a posted childcare receipt refuses a `paid_at` edit
#   L2  a posted childcare receipt refuses a `status_key` edit
#   L3  a posted childcare receipt refuses a `payment_status_id` edit
#   L4  a posted childcare receipt refuses reversion to `voided`      (the new hole)
#   L5  a posted childcare receipt still refuses `pending` / `failed` (the old guarantee, intact)
#   L6  a PENDING childcare payment may still move — this freezes posted money, not all money
#   L7  JOB billing still edits status_key / paid_at in place         (no vertical regression)
#   L8  `money_order` is an accepted rail; a bogus rail is still refused
#
# Usage:  certification/financials/payment-lifecycle-immutability.cert.sh
# Requires: the shared cert stack up (alloy-stack use) and psql on PATH.
# =============================================================================
set -uo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORG='00000000-0000-4000-8000-000000000001'
AGREEMENT='fc500000-0000-4000-8000-0000000a0001'
HOUSEHOLD='fc500000-0000-4000-8000-0000000c0001'
ACTOR='00000000-0000-4000-8000-0000000000aa'
JOB_SRC='fc500000-0000-4000-8000-0000000b0002'

DB="${CERT_DB_URL:-}"
if [ -z "$DB" ]; then
    DB="$(ALLOY_STACK_INTERNAL=1 supabase --workdir "$CERT_DIR" status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
fi
[ -n "$DB" ] || { echo "✗ cannot resolve the cert DB_URL — is the shared stack up? (alloy-stack status)"; exit 1; }

PASS=0; FAIL=0
note()  { printf '%s\n' "$1"; }
ok()    { PASS=$((PASS+1)); note "  ✓ $1"; }
bad()   { FAIL=$((FAIL+1)); note "  ✗ $1"; }
q()     { psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$1" 2>&1; }

must_fail() {  # $1 label  $2 sql  $3 expected substring
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    local rc=$?
    if [ $rc -eq 0 ]; then
        bad "$1 — expected a refusal, the statement SUCCEEDED"
    elif printf '%s' "$out" | grep -q "$3"; then
        ok "$1"
    else
        bad "$1 — refused, but not for the stated reason: ${out//$'\n'/ }"
    fi
}

must_ok() {  # $1 label  $2 sql
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    if [ $? -eq 0 ]; then ok "$1"; else bad "$1 — expected success, got: ${out//$'\n'/ }"; fi
}

note "THREAD 8B — posted childcare receipt lifecycle immutability"
note "database: $DB"
note "commit:   $(git -C "$CERT_DIR/.." rev-parse --short HEAD 2>/dev/null)"
note ""

psql "$DB" -v ON_ERROR_STOP=1 -q -f "$CERT_DIR/fixtures/financials-charge-spine.sql" >/dev/null 2>&1 \
    || { note "✗ fixture failed to apply"; exit 1; }
note "fixture:  certification/fixtures/financials-charge-spine.sql applied"
note ""

record() {  # $1 source_type $2 source_id $3 status $4 method -> id
    q "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
          amount_cents, currency, status, direction, payment_method, received_at, posted_at,
          paid_at, status_key, metadata, created_by, updated_by)
       values ('$ORG', null, '$HOUSEHOLD', '$1', '$2', 50000, 'USD', '$3', 'inbound', '$4', now(),
               $( [ "$3" = posted ] && echo now\(\) || echo null ),
               $( [ "$3" = posted ] && echo now\(\) || echo null ),
               '$3', '{}'::jsonb, '$ACTOR', '$ACTOR')
       returning id"
}

# ══ L1 · L2 · L3 — the three lifecycle fields ════════════════════════════════════════════════════
note "L1/L2/L3 — the lifecycle fields of a posted childcare receipt are frozen"
PAY="$(record enrollment_agreement "$AGREEMENT" posted check)"
if [ -z "$PAY" ]; then bad "could not record a posted childcare payment"; else
    ok "posted childcare receipt $PAY recorded"
    must_fail "L1 · paid_at cannot be edited in place" \
        "update payments set paid_at = now() - interval '10 days' where id='$PAY'" "lifecycle fields"
    must_fail "L2 · status_key cannot be edited in place" \
        "update payments set status_key='canceled' where id='$PAY'" "lifecycle fields"
    must_fail "L3 · payment_status_id cannot be edited in place" \
        "update payments set payment_status_id='11111111-1111-4111-8111-111111111111' where id='$PAY'" \
        "lifecycle fields"

    # ══ L4 — the hole this migration closes ══════════════════════════════════════════════════════
    note "L4 — a posted receipt cannot be VOIDED in place (money that arrived keeps counting)"
    must_fail "L4 · posted → voided is refused" \
        "update payments set status='voided' where id='$PAY'" "cannot revert to voided"

    # ══ L5 — the guarantee 20260903190000 already made, still intact ══════════════════════════════
    note "L5 — the original reversions are still refused"
    must_fail "L5 · posted → pending is refused" \
        "update payments set status='pending' where id='$PAY'" "cannot revert to pending"
    must_fail "L5 · posted → failed is refused" \
        "update payments set status='failed' where id='$PAY'" "cannot revert to failed"
fi

# ══ L6 — this freezes POSTED money, not all money ════════════════════════════════════════════════
note "L6 — a PENDING childcare payment is not frozen; an attempt may still resolve"
PEND="$(record enrollment_agreement "$AGREEMENT" pending card)"
if [ -z "$PEND" ]; then bad "could not record a pending childcare payment"; else
    must_ok "L6 · a pending attempt may still change status_key" \
        "update payments set status_key='processing' where id='$PEND'"
    must_ok "L6 · a pending attempt may still post" \
        "update payments set status='posted', posted_at=now(), paid_at=now(), status_key='paid' where id='$PEND'"
fi

# ══ L7 — job billing keeps its own lifecycle ═════════════════════════════════════════════════════
note "L7 — job billing is untouched: its PATCH route still edits live rows"
JOB_PAY="$(record job "$JOB_SRC" posted card)"
if [ -z "$JOB_PAY" ]; then bad "could not record a posted job payment"; else
    must_ok "L7 · a posted JOB payment still accepts a paid_at edit" \
        "update payments set paid_at = now() - interval '3 days' where id='$JOB_PAY'"
    # Exactly the shape `paymentRowFieldsForStatusKeyChange` writes: the lifecycle timestamps move
    # with the category, because `payments_posted_at_status_chk` has required that since Thread 1.
    # Asserting a naive UPDATE here would prove nothing about the route job billing actually uses.
    must_ok "L7 · a posted JOB payment still accepts a full status_key transition" \
        "update payments set status_key='canceled', status='voided', posted_at=null, voided_at=now()
          where id='$JOB_PAY'"
fi

# ══ L8 — the rail vocabulary ═════════════════════════════════════════════════════════════════════
note "L8 — money_order is a rail; the vocabulary is still closed"
MO="$(record customer "$HOUSEHOLD" posted money_order)"
if [ -n "$MO" ]; then ok "L8 · money_order is an accepted rail (payment $MO)"; else bad "L8 · money_order was refused"; fi
must_fail "L8 · an invented rail is still refused" \
    "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
       amount_cents, currency, status, direction, payment_method, received_at, metadata, created_by, updated_by)
     values ('$ORG', null, '$HOUSEHOLD', 'customer', '$HOUSEHOLD', 100, 'USD', 'pending', 'inbound',
             'bitcoin', now(), '{}'::jsonb, '$ACTOR', '$ACTOR')" \
    "payments_payment_method_chk"

note ""
note "RESULT: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1

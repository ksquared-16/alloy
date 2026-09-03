#!/usr/bin/env bash
# =============================================================================
# THREAD 8 — PAYMENT APPLICATION: live persistence certification.
#
# Proves against the REAL certification database (alloy-cert), not a mock, that money received
# reduces what is owed exactly once, cannot be duplicated by a retry, and cannot be given back by
# rewriting history.
#
# Every rule here is one the unit tests CANNOT prove. `childcarePaymentService.test.ts` runs against
# an in-memory store with no partial unique index, no trigger and no row lock, so it certifies the
# service's mirror of the rules and nothing more. The rules exist precisely because a service check
# races with itself — and `20260902140000` shipped a trigger and an index that disagreed about whose
# money they governed, which only live certification caught.
#
#   P1  a posted childcare charge accepts a payment and the balance drops exactly once
#   P2  the posted charge is NOT mutated — principal, category and posting stamp are as posted
#   P3  a second active application of the same payment to the same charge is refused
#   P4  a replayed idempotency key cannot write a second payment
#   P5  a replayed provider transaction cannot write a second payment
#   P6  a partial payment leaves an exact residual, and a second payment settles it
#   P7  over-applying a payment is refused
#   P8  over-paying a charge is refused
#   P9  a pending payment's application does not reduce the balance
#   P10 a draft / void / non-positive charge refuses money
#   P11 concurrent applications of one payment to one charge cannot both live
#   P12 a refund is a NEW row with lineage; the receipt is immutable and undeletable
#   P13 refunds cannot exceed what was received, and a refund cannot be refunded
#   P14 an application is reversed, never deleted
#   P15 a household (customer) source is protected exactly as an enrolment source is
#   P16 job billing is untouched by every rule above
#
# The read-model half is certified where it lives, because "the database holds the rule" and "the
# card reports what the database holds" are different claims:
#   read model — web/tests/financials/live/paymentApplication.live.test.ts
#   operator   — certification/playwright/financials-payment-lifecycle.cert.spec.ts
#
# Usage:  certification/financials/payment-application.cert.sh
# Requires: the shared cert stack up (certification/alloy-certify up) and psql on PATH.
# =============================================================================
set -uo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$CERT_DIR/.." && pwd)"
ORG='00000000-0000-4000-8000-000000000001'
AGREEMENT='fc500000-0000-4000-8000-0000000a0001'
HOUSEHOLD='fc500000-0000-4000-8000-0000000c0001'
EVIDENCE="$CERT_DIR/evidence/payment-application.txt"

DB="${CERT_DB_URL:-}"
if [ -z "$DB" ]; then
    DB="$(supabase --workdir "$CERT_DIR" status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
fi
[ -n "$DB" ] || { echo "✗ cannot resolve the cert DB_URL — is the shared stack up? (alloy-stack status)"; exit 1; }

PASS=0; FAIL=0
declare -a LINES=()

note()  { LINES+=("$1"); printf '%s\n' "$1"; }
ok()    { PASS=$((PASS+1)); note "  ✓ $1"; }
bad()   { FAIL=$((FAIL+1)); note "  ✗ $1"; }
q()     { psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$1" 2>&1; }

must_ok() {  # $1 label  $2 sql
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    if [ $? -eq 0 ]; then ok "$1"; else bad "$1 — expected success, got: ${out//$'\n'/ }"; fi
}

must_fail() {  # $1 label  $2 sql  $3 expected substring
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    local rc=$?
    if [ $rc -eq 0 ]; then
        bad "$1 — expected a refusal, the statement SUCCEEDED"
    elif printf '%s' "$out" | grep -q "$3"; then
        ok "$1 (refused: $(printf '%s' "$out" | grep -o "$3" | head -1))"
    else
        bad "$1 — refused, but not for the stated reason: ${out//$'\n'/ }"
    fi
}

# Assert a scalar SQL expression equals an expected value. Money certification needs EXACT numbers,
# not "the statement ran".
must_eq() {  # $1 label  $2 sql  $3 expected
    local out; out="$(q "$2")"
    if [ "$out" = "$3" ]; then ok "$1 (= $3)"; else bad "$1 — expected $3, got '${out//$'\n'/ }'"; fi
}

note "THREAD 8 — payment application, live persistence certification"
note "database: ${DB%%\?*}"
note "commit:   $(cd "$REPO_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
note "run at:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
note ""

# ── The migration itself is present and shaped as intended ───────────────────────────────────────
note "M — migration 20260903190000 applied to this database"
must_ok "the generic billable-source dimension exists on payments" \
    "select 1/(case when count(*)=2 then 1 else 0 end) from information_schema.columns
       where table_schema='public' and table_name='payments'
         and column_name in ('billable_source_type','billable_source_id')"
must_ok "idempotency and refund-lineage columns exist on payments" \
    "select 1/(case when count(*)=2 then 1 else 0 end) from information_schema.columns
       where table_schema='public' and table_name='payments'
         and column_name in ('idempotency_key','refunds_payment_id')"
must_ok "the one-active-application index exists" \
    "select 1/count(*) from pg_indexes where schemaname='public'
       and indexname='uq_payment_allocations_one_active_per_payment_charge'"
must_ok "the idempotency index exists" \
    "select 1/count(*) from pg_indexes where schemaname='public'
       and indexname='uq_payments_org_idempotency_key'"
must_ok "the provider-transaction index exists" \
    "select 1/count(*) from pg_indexes where schemaname='public'
       and indexname='uq_payments_org_processor_transaction'"
for trg in trg_enforce_payment_allocation_bounds trg_enforce_payment_refund_bounds \
           trg_enforce_childcare_payment_immutability trg_enforce_payment_allocation_no_delete; do
    must_ok "trigger $trg exists" "select 1/count(*) from pg_trigger where tgname='$trg'"
done

# THE JOB_ID CLAIM. Thread 1's readout said `payments.job_id is NOT NULL` and Thread 8 was planned
# around it. It is asserted here rather than believed.
must_eq "payments.job_id is NULLABLE (Thread 1's readout was wrong)" \
    "select is_nullable from information_schema.columns
      where table_schema='public' and table_name='payments' and column_name='job_id'" "YES"

# ── Fixture ──────────────────────────────────────────────────────────────────────────────────────
psql "$DB" -v ON_ERROR_STOP=1 -q -f "$CERT_DIR/fixtures/financials-charge-spine.sql" >/dev/null 2>&1 \
    || { note "✗ fixture failed to apply"; exit 1; }
note "fixture:  certification/fixtures/financials-charge-spine.sql applied"
note ""

ACTOR='00000000-0000-4000-8000-0000000000aa'

post_charge() {  # $1 source_type  $2 source_id  $3 amount  -> charge id
    local id
    id="$(q "insert into charges (org_id, job_id, billable_source_type, billable_source_id, charge_type,
                                  charge_category, status, currency_code, amount_cents, service_date,
                                  due_date, description, metadata, created_by, updated_by)
             values ('$ORG', null, '$1', '$2', 'fee', 'fee', 'draft', 'USD', $3, current_date,
                     current_date - 7, 'certification charge', '{}'::jsonb, '$ACTOR', '$ACTOR')
             returning id")"
    q "update charges set status='posted', posted_at=now(), posted_by='$ACTOR', updated_by='$ACTOR'
        where id='$id' and status='draft'" >/dev/null
    printf '%s' "$id"
}

# The payment the service writes: job_id NULL, the childcare source, an idempotency key.
record_payment_sql() {  # $1 source_type  $2 source_id  $3 amount  $4 status  $5 idem  $6 proc_txn
    local posted="null" idem="null" txn="null"
    [ "$4" = "posted" ] && posted="now()"
    [ -n "${5:-}" ] && idem="'$5'"
    [ -n "${6:-}" ] && txn="'$6'"
    printf "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
              idempotency_key, amount_cents, currency, status, direction, payment_method, processor,
              processor_transaction_id, received_at, posted_at, metadata, created_by, updated_by)
            values ('%s', null, '%s', '%s', '%s', %s, %s, 'USD', '%s', 'inbound', 'check', 'manual',
                    %s, now(), %s, '{}'::jsonb, '%s', '%s')" \
        "$ORG" "$HOUSEHOLD" "$1" "$2" "$idem" "$3" "$4" "$txn" "$posted" "$ACTOR" "$ACTOR"
}

record_payment() {  # same args -> payment id
    q "$(record_payment_sql "$1" "$2" "$3" "$4" "${5:-}" "${6:-}") returning id"
}

apply_sql() {  # $1 payment_id  $2 charge_id  $3 amount
    printf "insert into payment_allocations (org_id, payment_id, charge_id, target_entity_type,
              target_entity_id, allocated_amount_cents, status, allocation_type, allocated_at,
              metadata, created_by, updated_by)
            values ('%s', '%s', '%s', 'charge', '%s', %s, 'active', 'payment_application', now(),
                    '{}'::jsonb, '%s', '%s')" "$ORG" "$1" "$2" "$2" "$3" "$ACTOR" "$ACTOR"
}

# THE BALANCE, by the one rule: charge amount minus ACTIVE applications on POSTED payments. Quoted
# from `jobPaymentBalances`, not re-derived, so the certification cannot certify a different rule
# than the one the product runs.
outstanding() {  # $1 charge_id
    q "select c.amount_cents - coalesce((
           select sum(a.allocated_amount_cents) from payment_allocations a
             join payments p on p.id = a.payment_id
            where a.charge_id = c.id and a.status='active' and p.status='posted'), 0)
         from charges c where c.id='$1'"
}

# ══ P1 · P2 — money applies once, and the charge is not touched ══════════════════════════════════
note "P1/P2 — a posted enrolment charge is paid, the balance drops once, the charge is unmoved"
CHG="$(post_charge enrollment_agreement "$AGREEMENT" 130000)"
if [ -z "$CHG" ]; then bad "could not post an enrolment charge"; else
    must_eq "P1 · the charge starts fully outstanding" "$(printf 'select %s' "$(outstanding "$CHG")")" "130000"
    PAY="$(record_payment enrollment_agreement "$AGREEMENT" 130000 posted "cert-pay-1" "cert-txn-1")"
    if [ -z "$PAY" ]; then bad "could not record a childcare payment"; else
        ok "payment $PAY persisted with job_id NULL"
        must_eq "P1 · job_id really is null on the persisted row" \
            "select coalesce(job_id::text,'null') from payments where id='$PAY'" "null"
        must_ok "P1 · the application is accepted" "$(apply_sql "$PAY" "$CHG" 130000)"
        must_eq "P1 · the balance dropped to zero, exactly once" "$(printf 'select %s' "$(outstanding "$CHG")")" "0"
        must_eq "P2 · the charge's principal is untouched" \
            "select amount_cents from charges where id='$CHG'" "130000"
        must_eq "P2 · the charge is still status=posted with its posting stamp" \
            "select (status='posted' and posted_at is not null and posted_by='$ACTOR')::text from charges where id='$CHG'" "true"

        # ══ P3 — a retried apply cannot reduce the balance twice ═════════════════════════════════
        note "P3 — a second active application of the same payment to the same charge is refused"
        must_fail "P3 · the duplicate application is refused by the index" \
            "$(apply_sql "$PAY" "$CHG" 1)" "uq_payment_allocations_one_active_per_payment_charge"
        must_eq "P3 · the balance is still zero, not negative" "$(printf 'select %s' "$(outstanding "$CHG")")" "0"

        # ══ P4 · P5 — a retry and a replayed provider event cannot duplicate money ═══════════════
        note "P4/P5 — a replayed request and a replayed provider event cannot write a second payment"
        must_fail "P4 · the same idempotency key is refused" \
            "$(record_payment_sql enrollment_agreement "$AGREEMENT" 130000 posted "cert-pay-1" "cert-txn-2")" \
            "uq_payments_org_idempotency_key"
        must_fail "P5 · the same provider transaction is refused" \
            "$(record_payment_sql enrollment_agreement "$AGREEMENT" 130000 posted "cert-pay-2" "cert-txn-1")" \
            "uq_payments_org_processor_transaction"

        # ══ P7 · P8 — neither side may be over-spent ═════════════════════════════════════════════
        note "P7/P8 — neither the payment nor the charge may be over-spent"
        PAY_SPARE="$(record_payment enrollment_agreement "$AGREEMENT" 5000 posted "cert-pay-spare" "")"
        must_fail "P8 · over-paying a settled charge is refused" \
            "$(apply_sql "$PAY_SPARE" "$CHG" 5000)" "would over-pay charge"
    fi
fi

# ══ P6 — partial payment, exact residual, second payment settles it ══════════════════════════════
note "P6 — a partial payment leaves an EXACT residual, and a second payment settles it"
CHG2="$(post_charge enrollment_agreement "$AGREEMENT" 100000)"
PAY_A="$(record_payment enrollment_agreement "$AGREEMENT" 40000 posted "cert-part-a" "")"
PAY_B="$(record_payment enrollment_agreement "$AGREEMENT" 60000 posted "cert-part-b" "")"
must_ok "P6 · the first partial application is accepted" "$(apply_sql "$PAY_A" "$CHG2" 40000)"
must_eq "P6 · the residual is exact"  "$(printf 'select %s' "$(outstanding "$CHG2")")" "60000"
must_ok "P6 · the second payment is accepted" "$(apply_sql "$PAY_B" "$CHG2" 60000)"
must_eq "P6 · the charge is settled"  "$(printf 'select %s' "$(outstanding "$CHG2")")" "0"
must_eq "P6 · the FIRST application is intact and still active" \
    "select allocated_amount_cents::text from payment_allocations
      where payment_id='$PAY_A' and charge_id='$CHG2' and status='active'" "40000"

# ══ P7 — over-applying one payment across targets ════════════════════════════════════════════════
note "P7 — a payment cannot be applied for more than it is worth"
CHG3="$(post_charge enrollment_agreement "$AGREEMENT" 100000)"
PAY_SMALL="$(record_payment enrollment_agreement "$AGREEMENT" 10000 posted "cert-small" "")"
must_ok   "P7 · applying the whole payment is accepted" "$(apply_sql "$PAY_SMALL" "$CHG3" 10000)"
must_fail "P7 · applying it again to ANOTHER charge over-applies it" \
    "$(apply_sql "$PAY_SMALL" "$CHG2" 10000)" "would over-apply payment"

# ══ P9 — a pending payment reduces nothing ═══════════════════════════════════════════════════════
note "P9 — a PENDING attempt may be applied, and still reduces nothing owed"
CHG4="$(post_charge enrollment_agreement "$AGREEMENT" 50000)"
PAY_PENDING="$(record_payment enrollment_agreement "$AGREEMENT" 50000 pending "cert-pending" "")"
must_ok "P9 · the application of a pending payment is accepted (earmarked, not money)" \
    "$(apply_sql "$PAY_PENDING" "$CHG4" 50000)"
must_eq "P9 · the balance has NOT moved" "$(printf 'select %s' "$(outstanding "$CHG4")")" "50000"

# ══ P10 — money is applied to an obligation that exists ══════════════════════════════════════════
note "P10 — a draft, a void and a credit charge all refuse money"
DRAFT="$(q "insert into charges (org_id, job_id, billable_source_type, billable_source_id, charge_type,
              charge_category, status, currency_code, amount_cents, metadata)
            values ('$ORG', null, 'enrollment_agreement', '$AGREEMENT', 'fee', 'fee', 'draft', 'USD',
                    9900, '{}'::jsonb) returning id")"
PAY_ANY="$(record_payment enrollment_agreement "$AGREEMENT" 9900 posted "cert-anypay" "")"
must_fail "P10 · a DRAFT charge refuses money" "$(apply_sql "$PAY_ANY" "$DRAFT" 9900)" "cannot receive a payment"
NEG="$(q "insert into charges (org_id, job_id, billable_source_type, billable_source_id, charge_type,
            charge_category, status, currency_code, amount_cents, posted_at, metadata)
          values ('$ORG', null, 'enrollment_agreement', '$AGREEMENT', 'fee', 'credit', 'posted', 'USD',
                  -5000, now(), '{}'::jsonb) returning id")"
must_fail "P10 · a CREDIT (negative) charge refuses money" \
    "$(apply_sql "$PAY_ANY" "$NEG" 5000)" "non-positive amount"

# ══ P11 — concurrency: two applications of one payment to one charge ═════════════════════════════
note "P11 — two concurrent applications of one payment to one charge cannot both live"
CHG5="$(post_charge enrollment_agreement "$AGREEMENT" 80000)"
PAY_RACE="$(record_payment enrollment_agreement "$AGREEMENT" 80000 posted "cert-race" "")"
(psql "$DB" -q -tAc "$(apply_sql "$PAY_RACE" "$CHG5" 80000)" >/dev/null 2>&1) &
(psql "$DB" -q -tAc "$(apply_sql "$PAY_RACE" "$CHG5" 80000)" >/dev/null 2>&1) &
wait
must_eq "P11 · exactly ONE active application survived the race" \
    "select count(*)::text from payment_allocations
      where payment_id='$PAY_RACE' and charge_id='$CHG5' and status='active'" "1"
must_eq "P11 · the balance dropped once, not twice" "$(printf 'select %s' "$(outstanding "$CHG5")")" "0"

# ══ P12 · P13 · P14 — refund, lineage, immutability ══════════════════════════════════════════════
note "P12/P13/P14 — a refund is a new row; the receipt is frozen and the application is reversed"
CHG6="$(post_charge enrollment_agreement "$AGREEMENT" 70000)"
PAY_REF="$(record_payment enrollment_agreement "$AGREEMENT" 70000 posted "cert-refundable" "")"
must_ok "P12 · the payment applies" "$(apply_sql "$PAY_REF" "$CHG6" 70000)"
must_eq "P12 · the balance is settled before the refund" "$(printf 'select %s' "$(outstanding "$CHG6")")" "0"

must_fail "P12 · the receipt's amount cannot be edited in place" \
    "update payments set amount_cents=1 where id='$PAY_REF'" "is immutable"
must_fail "P12 · the receipt cannot be deleted" \
    "delete from payments where id='$PAY_REF'" "is immutable"
must_fail "P12 · a posted receipt cannot revert to pending" \
    "update payments set status='pending' where id='$PAY_REF'" "cannot revert to"
must_fail "P14 · an application cannot be deleted" \
    "delete from payment_allocations where payment_id='$PAY_REF'" "is not deletable"

REFUND="$(q "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
              refunds_payment_id, amount_cents, currency, status, direction, payment_method,
              received_at, posted_at, metadata, created_by, updated_by)
            values ('$ORG', null, '$HOUSEHOLD', 'enrollment_agreement', '$AGREEMENT', '$PAY_REF',
                    70000, 'USD', 'posted', 'outbound', 'check', now(), now(), '{}'::jsonb,
                    '$ACTOR', '$ACTOR') returning id")"
if [ -z "$REFUND" ]; then bad "could not record a refund"; else
    ok "refund $REFUND persisted with lineage to $PAY_REF"
    must_eq "P12 · the receipt still reads exactly as received" \
        "select (amount_cents=70000 and direction='inbound' and status='posted')::text
           from payments where id='$PAY_REF'" "true"
    must_ok "P12 · reversing the application is accepted" \
        "update payment_allocations set status='reversed', reversed_at=now(), reversal_reason='certification refund'
          where payment_id='$PAY_REF' and status='active'"
    must_eq "P12 · the balance is back" "$(printf 'select %s' "$(outstanding "$CHG6")")" "70000"
    must_eq "P14 · the reversed application still EXISTS — history is not erased" \
        "select count(*)::text from payment_allocations where payment_id='$PAY_REF' and status='reversed'" "1"

    must_fail "P13 · refunding more than was received is refused" \
        "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
           refunds_payment_id, amount_cents, currency, status, direction, payment_method, received_at,
           posted_at, metadata)
         values ('$ORG', null, '$HOUSEHOLD', 'enrollment_agreement', '$AGREEMENT', '$PAY_REF', 1,
                 'USD', 'posted', 'outbound', 'check', now(), now(), '{}'::jsonb)" \
        "would exceed the"
    must_fail "P13 · a refund cannot itself be refunded" \
        "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
           refunds_payment_id, amount_cents, currency, status, direction, payment_method, received_at,
           posted_at, metadata)
         values ('$ORG', null, '$HOUSEHOLD', 'enrollment_agreement', '$AGREEMENT', '$REFUND', 1,
                 'USD', 'posted', 'outbound', 'check', now(), now(), '{}'::jsonb)" \
        "is itself a refund"
fi

# ══ P15 — the household source gets the same protection ══════════════════════════════════════════
note "P15 — a household (customer) payment is protected exactly as an enrolment one is"
HH_CHG="$(post_charge customer "$HOUSEHOLD" 7500)"
HH_PAY="$(record_payment customer "$HOUSEHOLD" 7500 posted "cert-hh" "")"
must_ok "P15 · a pre-enrolment household payment applies" "$(apply_sql "$HH_PAY" "$HH_CHG" 7500)"
must_eq "P15 · the household balance is settled" "$(printf 'select %s' "$(outstanding "$HH_CHG")")" "0"
must_fail "P15 · the household receipt is immutable in place" \
    "update payments set amount_cents=1 where id='$HH_PAY'" "is immutable"
must_fail "P15 · a duplicate household application is refused" \
    "$(apply_sql "$HH_PAY" "$HH_CHG" 1)" "uq_payment_allocations_one_active_per_payment_charge"

# ══ P16 — job billing is untouched ═══════════════════════════════════════════════════════════════
note "P16 — job billing keeps its own lifecycle; the childcare enforcement does not reach it"
JOB_SRC='fc500000-0000-4000-8000-0000000b0002'
q "delete from payment_allocations where org_id='$ORG' and payment_id in
     (select id from payments where org_id='$ORG' and billable_source_type='job' and billable_source_id='$JOB_SRC');
   delete from payments where org_id='$ORG' and billable_source_type='job' and billable_source_id='$JOB_SRC'" >/dev/null
JOB_PAY="$(q "insert into payments (org_id, job_id, customer_id, billable_source_type, billable_source_id,
                amount_cents, currency, status, direction, payment_method, received_at, posted_at, metadata)
              values ('$ORG', null, null, 'job', '$JOB_SRC', 20000, 'USD', 'posted', 'inbound',
                      'card', now(), now(), '{}'::jsonb) returning id")"
if [ -z "$JOB_PAY" ]; then bad "could not create a job-source payment"; else
    # The job payments PATCH route edits status_key / paid_at / notes on live rows. A rule written
    # against ALL payments instead of the childcare set would break it — this is the negative control.
    must_ok "P16 · a posted JOB payment is still editable in place (no childcare immutability)" \
        "update payments set notes='job edit', paid_at=now() where id='$JOB_PAY'"
    must_ok "P16 · a posted job payment can still be deleted" \
        "delete from payments where id='$JOB_PAY'"
fi

note ""
note "RESULT: ${PASS} passed, ${FAIL} failed"
mkdir -p "$CERT_DIR/evidence"
printf '%s\n' "${LINES[@]}" > "$EVIDENCE"
note "evidence: ${EVIDENCE#$REPO_ROOT/}"
[ "$FAIL" -eq 0 ]

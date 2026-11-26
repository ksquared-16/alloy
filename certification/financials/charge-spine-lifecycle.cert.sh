#!/usr/bin/env bash
# =============================================================================
# THREAD 1 — FINANCIAL TRANSACTION SPINE: live persistence certification.
#
# Proves against the REAL certification database (alloy-cert), not a mock, that the charge spine
# behaves as the doctrine claims. Mocks were what allowed `chargeLifecycleService` to write
# `updated_by` for months against a column that did not exist; a rule that has only ever been
# asserted against a fake store has not been certified.
#
# Covers the Thread 1 lifecycle (draft -> post -> balance, actor attribution, posted immutability)
# and the correction-lineage closure added by `20260902140000`:
#
#   R1  a posted childcare charge is reversed exactly once
#   R2  the original stays status=posted and financially immutable
#   R3  the reversal references the original through source_charge_id
#   R5  original + reversal net to zero in the persisted ledger
#   R8  a second reversal of the same source is rejected
#   R9  a correction cannot itself be corrected
#   R10 concurrent reversals of one source cannot both live
#   R11 partial credits are allowed and reduce the outstanding amount
#   R12 household (customer) sources get the same protection as enrollment_agreement
#   R13 job billing is unaffected by the childcare enforcement
#
# R4, R6 and R7 are read-model/operator facts and are certified where they live:
#   R4/R5/R11 read model — web/tests/financials/live/chargeCorrectionLineage.live.test.ts
#   R6/R7     operator   — certification/playwright/financials-charge-lifecycle.cert.spec.ts
#
# Usage:  certification/financials/charge-spine-lifecycle.cert.sh
# Requires: the shared cert stack up (certification/alloy-certify up) and psql on PATH.
# =============================================================================
set -uo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$CERT_DIR/.." && pwd)"
ORG='00000000-0000-4000-8000-000000000001'
AGREEMENT='fc500000-0000-4000-8000-0000000a0001'
HOUSEHOLD='fc500000-0000-4000-8000-0000000c0001'
EVIDENCE="$CERT_DIR/evidence/charge-spine-lifecycle.txt"

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

# Assert a statement SUCCEEDS.
must_ok() {  # $1 label  $2 sql
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    if [ $? -eq 0 ]; then ok "$1"; else bad "$1 — expected success, got: ${out//$'\n'/ }"; fi
}

# Assert a statement FAILS, and that the refusal says what we claim it says.
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

note "THREAD 1 — financial transaction spine, live persistence certification"
note "database: ${DB%%\?*}"
note "commit:   $(cd "$REPO_ROOT" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
note "run at:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
note ""

# ── The migration itself is present and shaped as intended ───────────────────────────────────────
note "M — migration 20260902140000 applied to this database"
must_ok "unique index uq_charges_one_live_reversal_per_source exists" \
    "select 1/count(*) from pg_indexes where schemaname='public' and indexname='uq_charges_one_live_reversal_per_source'"
must_ok "lineage trigger trg_enforce_charge_correction_lineage exists" \
    "select 1/count(*) from pg_trigger where tgname='trg_enforce_charge_correction_lineage'"
must_ok "actor attribution columns exist on charges (20260902130000)" \
    "select 1/(case when count(*)=3 then 1 else 0 end) from information_schema.columns
       where table_schema='public' and table_name='charges'
         and column_name in ('created_by','updated_by','posted_by')"

# ── Fixture ──────────────────────────────────────────────────────────────────────────────────────
psql "$DB" -v ON_ERROR_STOP=1 -q -f "$CERT_DIR/fixtures/financials-charge-spine.sql" >/dev/null 2>&1 \
    || { note "✗ fixture failed to apply"; exit 1; }
note "fixture:  certification/fixtures/financials-charge-spine.sql applied"
note ""

ACTOR='00000000-0000-4000-8000-0000000000aa'

# Create a DRAFT, then post it — two statements, exactly as the service does. (A data-modifying CTE
# cannot post its own INSERT: the UPDATE's snapshot predates the row, so it matches nothing.)
post_charge() {  # $1 source_type  $2 source_id  $3 amount
    local id
    id="$(q "insert into charges (org_id, job_id, billable_source_type, billable_source_id, charge_type,
                                  charge_category, status, currency_code, amount_cents, service_date,
                                  due_date, description, metadata, created_by, updated_by)
             values ('$ORG', null, '$1', '$2', 'fee', 'fee', 'draft', 'USD', $3, current_date,
                     current_date - 7, 'certification charge', '{}'::jsonb, '$ACTOR', '$ACTOR')
             returning id")"
    # The transition guard lives IN the UPDATE, which is what makes posting idempotent under retry.
    q "update charges set status='posted', posted_at=now(), posted_by='$ACTOR', updated_by='$ACTOR'
        where id='$id' and status='draft'" >/dev/null
    printf '%s' "$id"
}

reverse_sql() {  # $1 source_charge_id  -> SQL that writes a reversal of it
    printf "insert into charges (org_id, job_id, billable_source_type, billable_source_id, source_charge_id,
              charge_type, charge_category, status, currency_code, amount_cents, service_date, posted_at,
              description, metadata, created_by, updated_by, posted_by)
            select org_id, null, billable_source_type, billable_source_id, id, charge_type, 'credit',
                   'posted', currency_code, -amount_cents, service_date, now(), 'reversal',
                   jsonb_build_object('correction_kind','reversal','source_charge_id', id),
                   '%s', '%s', '%s'
              from charges where id = '%s'" "$ACTOR" "$ACTOR" "$ACTOR" "$1"
}

# ══ R1 · R3 · R5 — reverse exactly once, linked, and netting to zero ═════════════════════════════
note "R1/R3/R5 — an enrolment charge posts, reverses once, and the pair nets to zero"
ENROL_POSTED="$(post_charge enrollment_agreement "$AGREEMENT" 130000)"
if [ -z "$ENROL_POSTED" ]; then bad "could not post an enrolment charge"; else
    ok "posted charge $ENROL_POSTED persisted"
    must_ok "R-actor · the posting actor is recorded (posted_by)" \
        "select 1/count(*) from charges where id='$ENROL_POSTED' and status='posted' and posted_by='$ACTOR' and posted_at is not null"
    must_ok "R1 · the first reversal is accepted" "$(reverse_sql "$ENROL_POSTED")"
    must_ok "R3 · the reversal references the original through source_charge_id" \
        "select 1/count(*) from charges where source_charge_id='$ENROL_POSTED' and metadata->>'correction_kind'='reversal'"
    must_ok "R5 · original + reversal net to zero in the persisted ledger" \
        "select 1/(case when coalesce(sum(amount_cents),999)=0 then 1 else 0 end) from charges
           where id='$ENROL_POSTED' or source_charge_id='$ENROL_POSTED'"
fi

# ══ R2 — the original is untouched and immutable ═════════════════════════════════════════════════
note "R2 — the original stays posted and financially immutable"
must_ok "R2 · the original is still status=posted with its amount intact" \
    "select 1/count(*) from charges where id='$ENROL_POSTED' and status='posted' and amount_cents=130000"
must_fail "R2 · an in-place amount edit is refused" \
    "update charges set amount_cents=1 where id='$ENROL_POSTED'" "is immutable"
must_fail "R2 · DELETE of posted money is refused" \
    "delete from charges where id='$ENROL_POSTED'" "is immutable"
must_fail "R2 · rewriting the posting actor is refused" \
    "update charges set posted_by=null where id='$ENROL_POSTED'" "is immutable"

# ══ R8 · R9 — the bound ══════════════════════════════════════════════════════════════════════════
note "R8/R9 — the correction is bounded"
must_fail "R8 · a second reversal of the same charge is rejected" \
    "$(reverse_sql "$ENROL_POSTED")" "already been reversed"
REVERSAL="$(q "select id from charges where source_charge_id='$ENROL_POSTED' and metadata->>'correction_kind'='reversal' limit 1")"
must_fail "R9 · a correction cannot itself be corrected" \
    "$(reverse_sql "$REVERSAL")" "is itself a correction"
must_fail "R8 · no correction of ANY kind survives a reversal (a credit is refused too)" \
    "insert into charges (org_id, billable_source_type, billable_source_id, source_charge_id, charge_type,
        charge_category, status, currency_code, amount_cents, metadata)
     select org_id, billable_source_type, billable_source_id, id, charge_type, 'credit', 'posted',
            currency_code, -1000, jsonb_build_object('correction_kind','credit')
       from charges where id='$ENROL_POSTED'" "already been reversed"

# ══ R10 — concurrency ════════════════════════════════════════════════════════════════════════════
note "R10 — two concurrent reversals of one charge cannot both live"
CONC="$(post_charge enrollment_agreement "$AGREEMENT" 55000)"
LOSER_LOG="$(mktemp)"
# Session A holds its transaction open across B's attempt. B's snapshot cannot see A's uncommitted
# row, so the TRIGGER passes for both — the unique index is what actually decides.
( psql "$DB" -v ON_ERROR_STOP=1 -tAc "begin; $(reverse_sql "$CONC"); select pg_sleep(3); commit;" >/dev/null 2>&1 ) &
A_PID=$!
sleep 1
psql "$DB" -v ON_ERROR_STOP=1 -tAc "begin; $(reverse_sql "$CONC"); commit;" > "$LOSER_LOG" 2>&1
B_RC=$?
wait $A_PID
LIVE="$(q "select count(*) from charges where source_charge_id='$CONC' and status<>'void' and metadata->>'correction_kind'='reversal'")"
if [ "$LIVE" = "1" ]; then ok "R10 · exactly one live reversal survived two concurrent writers"; else
    bad "R10 · $LIVE live reversals after two concurrent writers (expected 1)"; fi
if [ $B_RC -ne 0 ] && grep -q "uq_charges_one_live_reversal_per_source" "$LOSER_LOG"; then
    ok "R10 · the loser was refused by the unique index, not by a racing read"
else
    bad "R10 · the loser did not fail on the index: $(tr '\n' ' ' < "$LOSER_LOG")"
fi
rm -f "$LOSER_LOG"

# ══ R11 — partial credits ════════════════════════════════════════════════════════════════════════
note "R11 — partial credits are allowed while the charge stands, and reduce what is outstanding"
CREDITED="$(post_charge enrollment_agreement "$AGREEMENT" 100000)"
credit_sql() {  # $1 source  $2 amount
    printf "insert into charges (org_id, billable_source_type, billable_source_id, source_charge_id,
              charge_type, charge_category, status, currency_code, amount_cents, due_date, metadata)
            select org_id, billable_source_type, billable_source_id, id, charge_type, 'credit', 'posted',
                   currency_code, %s, due_date, jsonb_build_object('correction_kind','credit')
              from charges where id = '%s'" "$2" "$1"
}
must_ok "R11 · a first partial credit is accepted"  "$(credit_sql "$CREDITED" -30000)"
must_ok "R11 · a second partial credit is accepted" "$(credit_sql "$CREDITED" -10000)"
must_ok "R11 · the outstanding amount is reduced by exactly the credits (100000-40000)" \
    "select 1/(case when coalesce(sum(amount_cents),0)=60000 then 1 else 0 end) from charges
       where id='$CREDITED' or source_charge_id='$CREDITED'"
must_ok "R11 · a partially credited charge may still be reversed once" "$(reverse_sql "$CREDITED")"

# ══ R12 — household parity ═══════════════════════════════════════════════════════════════════════
note "R12 — a household (customer) source is protected exactly as an enrolment source is"
HH_POSTED="$(post_charge customer "$HOUSEHOLD" 7500)"
if [ -z "$HH_POSTED" ]; then bad "could not post a household charge"; else
    ok "posted household charge $HH_POSTED persisted (pre-enrolment money is representable)"
    must_ok   "R12 · the first household reversal is accepted" "$(reverse_sql "$HH_POSTED")"
    must_fail "R12 · a second household reversal is rejected"  "$(reverse_sql "$HH_POSTED")" "already been reversed"
    must_fail "R12 · the household original is immutable in place" \
        "update charges set amount_cents=1 where id='$HH_POSTED'" "is immutable"
    HH_REV="$(q "select id from charges where source_charge_id='$HH_POSTED' limit 1")"
    must_fail "R12 · a household correction cannot itself be corrected" \
        "$(reverse_sql "$HH_REV")" "is itself a correction"
fi

# ══ R13 — job billing is untouched ═══════════════════════════════════════════════════════════════
note "R13 — job billing keeps its own lifecycle; the childcare enforcement does not reach it"
# The guarantees discriminate on `billable_source_type`, so a job-source row is the exact negative
# control. No `jobs` row is needed (and none is created): job_id stays NULL and the source pair
# carries the identity, which `charges_source_present_chk` accepts.
JOB_SRC='fc500000-0000-4000-8000-0000000b0001'
q "delete from charges where org_id='$ORG' and billable_source_type='job' and billable_source_id='$JOB_SRC'" >/dev/null
JOB_POSTED="$(q "insert into charges (org_id, job_id, billable_source_type, billable_source_id, charge_type,
                    charge_category, status, currency_code, amount_cents, metadata)
                 values ('$ORG', null, 'job', '$JOB_SRC', 'service', 'fee', 'posted', 'USD', 20000, '{}'::jsonb)
                 returning id")"
if [ -z "$JOB_POSTED" ]; then bad "could not create a job-source charge"; else
    must_ok   "R13 · a posted JOB charge is still editable in place (no childcare immutability)" \
        "update charges set amount_cents=21000 where id='$JOB_POSTED'"
    must_ok   "R13 · a job charge accepts a first correction" "$(reverse_sql "$JOB_POSTED")"
    must_ok   "R13 · a job charge accepts a SECOND correction — the bound is childcare's, not job's" \
        "$(reverse_sql "$JOB_POSTED")"
    must_ok   "R13 · a posted job charge can still be deleted" \
        "delete from charges where source_charge_id='$JOB_POSTED'; delete from charges where id='$JOB_POSTED'"
fi

note ""
note "RESULT: ${PASS} passed, ${FAIL} failed"
mkdir -p "$CERT_DIR/evidence"
printf '%s\n' "${LINES[@]}" > "$EVIDENCE"
note "evidence: ${EVIDENCE#$REPO_ROOT/}"
[ "$FAIL" -eq 0 ]

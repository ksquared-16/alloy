#!/usr/bin/env bash
# =============================================================================
# THREAD 5 — BILLING PERIODS + FINANCIAL JOURNAL: live persistence certification.
#
# Proves against the REAL certification database (alloy-cert) that the rules the
# database must own are the database's. Every rule certified here fails the same
# way if it lives in application code — two concurrent writers each read a clean
# state and each write — which is why none of them is a service check.
#
#   P1  two calendars may cover the same days; two periods of ONE calendar may not
#   P2  monthly billing and a 4/4/5 accounting calendar describe the same day
#       differently, and neither is derived from the other
#   P3  an organisation has at most one ACTIVE calendar, so attribution is
#       deterministic rather than a matter of query order
#   P4  a journal entry is attributed to the period covering its effective date
#   P5  a CLOSED period defers to the next open one and says it deferred
#   P6  an effective date no period covers is refused, not guessed
#   P7  posted history is append-only: no UPDATE, no DELETE
#   P8  a period that has already reported cannot be re-dated
#   P9  a period cannot be hung off another organisation's calendar
#   P10 the same consequence recorded twice is one row (idempotency key)
#   P11 an org with no calendar still gets complete history, marked no_calendar
#   P12 post_payment_to_ledger is GONE and its replacement is named for what it does
#
# The service-level vertical slice (charge -> payment -> application -> refund,
# each producing its journal entry through the real services) is certified in
# web/tests/financials/live/financialJournal.live.test.ts, because those are
# service behaviours and a SQL insert would bypass the very code under test.
#
# Usage:  certification/financials/period-journal.cert.sh
# Requires: the shared cert stack up (alloy-stack use) and psql on PATH.
# =============================================================================
set -uo pipefail

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORG='00000000-0000-4000-8000-000000000001'
OTHER_ORG='00000000-0000-4000-8000-0000000005e2'
EVIDENCE="$CERT_DIR/evidence/period-journal.txt"

DB="${CERT_DB_URL:-}"
if [ -z "$DB" ]; then
    DB="$(supabase --workdir "$CERT_DIR" status -o env 2>/dev/null | sed -n 's/^DB_URL="\(.*\)"$/\1/p')"
fi
[ -n "$DB" ] || { echo "✗ cannot resolve the cert DB_URL — is the shared stack up? (alloy-stack use)"; exit 1; }

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

# Assert a statement FAILS, and that the refusal says what we claim it says.
must_fail() {  # $1 label  $2 sql  $3 expected fragment
    local out; out="$(psql "$DB" -q -v ON_ERROR_STOP=1 -tAc "$2" 2>&1)"
    if [ $? -eq 0 ]; then
        bad "$1 — expected refusal, the write SUCCEEDED"
    elif printf '%s' "$out" | grep -qi -- "$3"; then
        ok "$1 (refused: $3)"
    else
        bad "$1 — refused for the wrong reason: ${out//$'\n'/ }"
    fi
}

eq() {  # $1 label  $2 sql  $3 expected
    local got; got="$(q "$2")"
    if [ "$got" = "$3" ]; then ok "$1"; else bad "$1 — expected '$3', got '$got'"; fi
}

# RESTORE THE ORG TO HAVING NO CALENDAR.
#
# The first version deleted only this run's own rows and was not re-runnable: a
# calendar cannot be deleted while journal entries reference it (ON DELETE
# RESTRICT), so any entry left behind by an earlier run kept an ACTIVE calendar
# alive — and the one-active-calendar index then refused this run's setup. Ten
# assertions failed for that reason and none of them was about what they name.
#
# So the teardown purges the journal for these orgs first, suspending the
# append-only trigger for its own session. Restoring a proving state is not an
# operator action; a teardown that could delete posted history through the
# ordinary path would mean the guarantee was not there.
cleanup() {
    psql "$DB" -q -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
        SET session_replication_role = replica;
        DELETE FROM public.financial_journal_entries WHERE org_id IN ('$ORG','$OTHER_ORG');
        SET session_replication_role = origin;
        DELETE FROM public.financial_accounting_periods WHERE org_id IN ('$ORG','$OTHER_ORG');
        DELETE FROM public.financial_accounting_calendars WHERE org_id IN ('$ORG','$OTHER_ORG');
        DELETE FROM public.orgs WHERE id = '$OTHER_ORG';
SQL
}
# The journal is append-only, so the teardown suspends that trigger for its own
# session: restoring a proving state is not an operator action, and a teardown
# that could delete posted history would mean the guarantee was not there.
cleanup_journal() {
    psql "$DB" -q -v ON_ERROR_STOP=0 >/dev/null 2>&1 <<SQL
        SET session_replication_role = replica;
        DELETE FROM public.financial_journal_entries WHERE idempotency_key LIKE 'cert5:%';
        SET session_replication_role = origin;
SQL
}

note "THREAD 5 — billing periods + financial journal, live certification"
note "database: $DB"
note "commit:   $(git -C "$CERT_DIR/.." rev-parse --short HEAD 2>/dev/null)"
note "run at:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
note ""

# -----------------------------------------------------------------------------
note "M — migration 20260904180000 applied to this database"
eq "  ✓ financial_accounting_calendars exists" \
   "select count(*) from information_schema.tables where table_schema='public' and table_name='financial_accounting_calendars'" "1"
eq "  ✓ financial_accounting_periods exists" \
   "select count(*) from information_schema.tables where table_schema='public' and table_name='financial_accounting_periods'" "1"
eq "  ✓ financial_journal_entries exists" \
   "select count(*) from information_schema.tables where table_schema='public' and table_name='financial_journal_entries'" "1"
eq "  ✓ the non-overlap exclusion constraint exists" \
   "select count(*) from pg_constraint where conname='financial_accounting_periods_no_overlap'" "1"

# P12 — the function that advertised a consequence it did not have.
eq "P12 · post_payment_to_ledger is gone" \
   "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='post_payment_to_ledger'" "0"
eq "P12 · its replacement is named for what it actually does" \
   "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='stamp_payment_posted_to_ledger_at'" "1"
eq "P12 · the job/Stripe trigger still fires on the same events" \
   "select count(*) from pg_trigger where tgname='payments_post_to_ledger' and not tgisinternal" "1"

cleanup
note ""

# -----------------------------------------------------------------------------
note "P1/P2/P3 — two calendars, two identities, one active"

must_ok "P3 · a monthly billing-shaped calendar is authored" \
    "insert into public.financial_accounting_calendars (org_id, calendar_key, name, period_style, is_active)
     values ('$ORG','books-445','FY2026 4/4/5','four_four_five', true)"

# 4/4/5 periods: P01 4wk, P02 4wk, P03 5wk — boundaries that are NOT month ends.
must_ok "P2 · 4/4/5 periods are authored with non-month boundaries" \
    "insert into public.financial_accounting_periods (org_id, calendar_id, period_key, label, starts_on, ends_on)
     select '$ORG', c.id, v.k, v.k, v.s::date, v.e::date
       from public.financial_accounting_calendars c,
            (values ('FY2026-P08','2026-08-02','2026-08-29'),
                    ('FY2026-P09','2026-08-30','2026-09-26'),
                    ('FY2026-P10','2026-09-27','2026-10-31')) as v(k,s,e)
      where c.org_id='$ORG' and c.calendar_key='books-445'"

eq "P2 · a 4/4/5 period boundary is not a month boundary" \
   "select ends_on::text from public.financial_accounting_periods where org_id='$ORG' and period_key='FY2026-P09'" "2026-09-26"

# The same day, two identities: billed under September, reported in P09.
eq "P2 · 30 September falls in P10 while billing calls it September" \
   "select period_key from public.financial_accounting_periods
     where org_id='$ORG' and '2026-09-30'::date between starts_on and ends_on" "FY2026-P10"

must_fail "P1 · two periods of ONE calendar cannot overlap" \
    "insert into public.financial_accounting_periods (org_id, calendar_id, period_key, starts_on, ends_on)
     select '$ORG', c.id, 'FY2026-P09b', '2026-09-20', '2026-10-05'
       from public.financial_accounting_calendars c where c.org_id='$ORG' and c.calendar_key='books-445'" \
    "financial_accounting_periods_no_overlap"

must_ok "P1 · a SECOND calendar may cover exactly the same days" \
    "insert into public.financial_accounting_calendars (org_id, calendar_key, name, period_style, is_active)
     values ('$ORG','books-monthly','Monthly view','calendar_month', false)"
must_ok "P1 · and its periods overlap the other calendar's freely" \
    "insert into public.financial_accounting_periods (org_id, calendar_id, period_key, starts_on, ends_on)
     select '$ORG', c.id, '2026-09', '2026-09-01', '2026-09-30'
       from public.financial_accounting_calendars c where c.org_id='$ORG' and c.calendar_key='books-monthly'"

must_fail "P3 · an org cannot have two ACTIVE calendars" \
    "update public.financial_accounting_calendars set is_active = true
      where org_id='$ORG' and calendar_key='books-monthly'" \
    "uq_financial_accounting_calendars_one_active_per_org"

note ""

# -----------------------------------------------------------------------------
note "P4/P5/P6 — attribution, deferral, and the date nobody configured"

must_ok "P4 · a consequence effective 10 Sep is written" \
    "insert into public.financial_journal_entries
       (org_id, billable_source_type, billable_source_id, source_type, source_id, entry_type,
        amount_cents, obligation_delta_cents, effective_on, billing_period_key, idempotency_key)
     values ('$ORG','enrollment_agreement', gen_random_uuid(), 'charge', gen_random_uuid(), 'charge_posted',
             130000, 130000, '2026-09-10', '2026-09', 'cert5:p4')"

eq "P4 · it is attributed to P09, the period covering its effective date" \
   "select accounting_period_key from public.financial_journal_entries where idempotency_key='cert5:p4'" "FY2026-P09"
eq "P4 · the billing period stayed the customer's month, not the accounting period" \
   "select billing_period_key from public.financial_journal_entries where idempotency_key='cert5:p4'" "2026-09"
eq "P4 · attribution is recorded as attributed" \
   "select period_attribution from public.financial_journal_entries where idempotency_key='cert5:p4'" "attributed"

must_ok "P5 · P09 is closed" \
    "update public.financial_accounting_periods set status='closed', closed_at=now()
      where org_id='$ORG' and period_key='FY2026-P09'"

must_ok "P5 · a consequence effective inside the CLOSED period is still accepted" \
    "insert into public.financial_journal_entries
       (org_id, billable_source_type, billable_source_id, source_type, source_id, entry_type,
        amount_cents, obligation_delta_cents, effective_on, idempotency_key)
     values ('$ORG','enrollment_agreement', gen_random_uuid(), 'charge', gen_random_uuid(), 'charge_corrected',
             130000, -130000, '2026-09-10', 'cert5:p5')"

eq "P5 · and reports in the next OPEN period instead" \
   "select accounting_period_key from public.financial_journal_entries where idempotency_key='cert5:p5'" "FY2026-P10"
eq "P5 · the row says it was deferred, so nobody has to infer why" \
   "select metadata->>'accounting_period_deferred' from public.financial_journal_entries where idempotency_key='cert5:p5'" "true"
eq "P5 · and from which date" \
   "select metadata->>'accounting_period_deferred_from_date' from public.financial_journal_entries where idempotency_key='cert5:p5'" "2026-09-10"

must_fail "P6 · an effective date NO period covers is refused, not guessed" \
    "insert into public.financial_journal_entries
       (org_id, billable_source_type, billable_source_id, source_type, source_id, entry_type,
        amount_cents, obligation_delta_cents, effective_on, idempotency_key)
     values ('$ORG','enrollment_agreement', gen_random_uuid(), 'charge', gen_random_uuid(), 'charge_posted',
             1000, 1000, '2027-06-01', 'cert5:p6')" \
    "accounting_period_unavailable"

must_ok "P5 · reopening P09 restores it" \
    "update public.financial_accounting_periods set status='open', closed_at=null
      where org_id='$ORG' and period_key='FY2026-P09'"

note ""

# -----------------------------------------------------------------------------
note "P7/P8 — posted history and reported periods do not move"

must_fail "P7 · a posted journal entry cannot be UPDATED" \
    "update public.financial_journal_entries set amount_cents = 1 where idempotency_key='cert5:p4'" \
    "cannot be updated"

must_fail "P7 · a posted journal entry cannot be DELETED" \
    "delete from public.financial_journal_entries where idempotency_key='cert5:p4'" \
    "cannot be deleted"

must_fail "P8 · a period that has already reported cannot be re-dated" \
    "update public.financial_accounting_periods set ends_on = '2026-09-30'
      where org_id='$ORG' and period_key='FY2026-P09'" \
    "boundaries are frozen"

eq "P8 · and the entry it reported still carries the key it was posted under" \
   "select accounting_period_key from public.financial_journal_entries where idempotency_key='cert5:p4'" "FY2026-P09"

must_ok "P8 · a period with nothing attributed may still be corrected" \
    "update public.financial_accounting_periods set ends_on = '2026-10-31'
      where org_id='$ORG' and period_key='FY2026-P10'"

note ""

# -----------------------------------------------------------------------------
note "P9/P10/P11 — one organisation's calendar, one consequence, and no calendar at all"

must_ok "P9 · a second organisation exists" \
    "insert into public.orgs (id, name, slug) values ('$OTHER_ORG','Cert Thread5 Other Org','cert-thread5-other')"

must_fail "P9 · a period cannot be hung off another organisation's calendar" \
    "insert into public.financial_accounting_periods (org_id, calendar_id, period_key, starts_on, ends_on)
     select '$OTHER_ORG', c.id, 'FY2026-P09', '2026-08-30', '2026-09-26'
       from public.financial_accounting_calendars c where c.org_id='$ORG' and c.calendar_key='books-445'" \
    "different organizations"

must_fail "P10 · the same consequence recorded twice is refused by the idempotency key" \
    "insert into public.financial_journal_entries
       (org_id, billable_source_type, billable_source_id, source_type, source_id, entry_type,
        amount_cents, obligation_delta_cents, effective_on, idempotency_key)
     values ('$ORG','enrollment_agreement', gen_random_uuid(), 'charge', gen_random_uuid(), 'charge_posted',
             130000, 130000, '2026-09-10', 'cert5:p4')" \
    "financial_journal_entries_org_idempotency_uq"

must_ok "P11 · an org with NO calendar still records complete history" \
    "insert into public.financial_journal_entries
       (org_id, billable_source_type, billable_source_id, source_type, source_id, entry_type,
        amount_cents, obligation_delta_cents, effective_on, idempotency_key)
     values ('$OTHER_ORG','customer', gen_random_uuid(), 'payment', gen_random_uuid(), 'payment_received',
             50000, 0, '2026-09-10', 'cert5:p11')"

eq "P11 · and says WHY it carries no period" \
   "select period_attribution from public.financial_journal_entries where idempotency_key='cert5:p11'" "no_calendar"
eq "P11 · attribution is all-or-nothing: no half-filled period" \
   "select coalesce(accounting_period_key,'<null>') from public.financial_journal_entries where idempotency_key='cert5:p11'" "<null>"

note ""

# -----------------------------------------------------------------------------
note "B — the journal is a period movement, never a balance"
eq "B · P09 movement is the charge that reported in it" \
   "select coalesce(sum(obligation_delta_cents),0)::text from public.financial_journal_entries
     where org_id='$ORG' and accounting_period_key='FY2026-P09'" "130000"
eq "B · P10 movement is the correction that deferred into it" \
   "select coalesce(sum(obligation_delta_cents),0)::text from public.financial_journal_entries
     where org_id='$ORG' and accounting_period_key='FY2026-P10'" "-130000"
eq "B · a receipt has an amount and moves no obligation" \
   "select amount_cents::text||'/'||obligation_delta_cents::text from public.financial_journal_entries
     where idempotency_key='cert5:p11'" "50000/0"

cleanup_journal
cleanup

note ""
note "RESULT: $PASS passed, $FAIL failed"
mkdir -p "$CERT_DIR/evidence"
printf '%s\n' "${LINES[@]}" > "$EVIDENCE"
echo "evidence: $EVIDENCE"
[ "$FAIL" -eq 0 ]

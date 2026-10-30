-- =============================================================================
-- ALLOY-CERT INCIDENT CENSUS — COUNT-ONLY, FIXED IDENTITIES. *** NOT EXECUTED. ***
--
-- Incident: req_1793375528498836_49075, 2026-10-30T15:52:13Z–15:52:32Z, live suites run against the
-- shared local alloy-cert stack (see INCIDENT-AND-CENSUS-PLAN.md).
--
-- There is NO registered action that may run this today: installed `database.read_census` accepts only
-- `alloy_deployed_primary` (hosted staging), and the certification_local target (127.0.0.1:54422) is
-- used only by migration / ledger operations, which must not be repurposed. This file is the exact input
-- for a HostCapacity-registered, count-only, read-only census on certification_local.
--
-- Contract: one READ ONLY transaction; every statement returns `question_id|kind|payload` where payload
-- is a COUNT (never a row value, id, name, amount or key); fixed predicates only; no writes, no DDL, no
-- functions with side effects. Counts alone cannot prove that nothing was deleted (no pre-incident
-- baseline exists); they bound what is present now and fix a post-incident baseline.
-- =============================================================================
begin transaction read only;

-- ── tuitionGeneration.live cleanup() scope (beforeAll AND afterAll unless CERT_KEEP=1) ─────────────
select 'q01_pricing_terms_seed_org' || '|count|' || count(*)
  from public.enrollment_pricing_terms
 where org_id = '00000000-0000-4000-8000-000000000001';
select 'q02_tuition_consumption_events_seed_org' || '|count|' || count(*)
  from public.consumption_events
 where org_id = '00000000-0000-4000-8000-000000000001' and idempotency_key like 'cev:tuition:%';
select 'q03_obligations_on_tuition_events_seed_org' || '|count|' || count(*)
  from public.resolved_obligations o
  join public.consumption_events e on e.id = o.consumption_event_id
 where e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key like 'cev:tuition:%';
select 'q04_draft_tuition_charges_seed_org' || '|count|' || count(*)
  from public.charges
 where org_id = '00000000-0000-4000-8000-000000000001' and charge_category = 'tuition' and status = 'draft';
select 'q05_nondraft_tuition_charges_seed_org' || '|count|' || count(*)
  from public.charges
 where org_id = '00000000-0000-4000-8000-000000000001' and charge_category = 'tuition' and status <> 'draft';
select 'q06_tuition_fixed_agreement_present' || '|count|' || count(*)
  from public.child_enrollment_agreements
 where id = '77000000-0000-4000-8000-0000000000a1';

-- ── paymentApplication / chargeCorrectionLineage / financialsCardPayments fixed identities ───────────
select 'q07_spine_fixed_agreement_present' || '|count|' || count(*)
  from public.child_enrollment_agreements
 where id = 'fc500000-0000-4000-8000-0000000a0001';
select 'q08_payments_with_incident_run_keys' || '|count|' || count(*)
  from public.payments
 where org_id = '00000000-0000-4000-8000-000000000001' and idempotency_key like 'live-1793375%';

-- ── anything that SURVIVED as an insert inside the incident window (seed org) ─────────────────────
select 'q09_window_' || t || '|count|' || n from (
  select 'charges' t, count(*) n from public.charges
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'payments', count(*) from public.payments
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'payment_allocations', count(*) from public.payment_allocations
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'enrollment_pricing_terms', count(*) from public.enrollment_pricing_terms
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'consumption_events', count(*) from public.consumption_events
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'resolved_obligations', count(*) from public.resolved_obligations
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'child_enrollment_agreements', count(*) from public.child_enrollment_agreements
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
  union all select 'financial_billing_periods', count(*) from public.financial_billing_periods
   where org_id = '00000000-0000-4000-8000-000000000001' and created_at between '2026-10-30T15:52:13Z' and '2026-10-30T15:52:33Z'
) w;

-- ── catalog only: cumulative tuple counters since the last stats reset (a deletion ever happened?) ───
select 'q10_pgstat_' || relname || '|count|' || n_tup_ins || ',' || n_tup_del || ',' || n_live_tup
  from pg_stat_user_tables
 where schemaname = 'public'
   and relname in ('enrollment_pricing_terms','consumption_events','resolved_obligations','charges',
                   'child_enrollment_agreements','payments','payment_allocations','financial_billing_periods');
select 'q11_pgstat_reset_time' || '|count|' || coalesce(extract(epoch from stats_reset)::bigint, 0)
  from pg_stat_database where datname = current_database();

rollback;

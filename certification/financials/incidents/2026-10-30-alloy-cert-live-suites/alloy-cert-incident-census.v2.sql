-- =============================================================================
-- ALLOY-CERT INCIDENT CENSUS v2 — EXACT INCIDENT IDENTITIES ONLY. COUNT-ONLY. *** NOT EXECUTED. ***
--
-- Supersedes v1 (alloy-cert-incident-census.sql, sha256 6a3a03bd…26aa, kept byte-identical because a
-- draft contract pins it). v2 drops every org-wide count, the `live-1793375%` payment prefix, the
-- whole-org time windows and the cumulative pg_stat counters. Every predicate is bound to a fixed
-- identity taken from the suites' own source or from the preserved runner output, with org pinned;
-- dependencies are joined only through those exact identities.
--
-- Constants and where they come from:
--   seed org        00000000-0000-4000-8000-000000000001            all four suites (ORG)
--   tuition agreement 77000000-0000-4000-8000-0000000000a1         tuitionGeneration.live.test.ts AGREEMENT
--   tuition terms   77000000-0000-4000-8000-0000000000b1, 77000000-0000-4000-8000-0000000000b2  TERM / SUCCESSOR_TERM
--   tuition events  cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01
--                   cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02
--                   tuitionOccurrenceKey(assignmentId, period); assignmentId = ocmId (generateTuitionCharges
--                   groups by opportunityCustomerMemberId, scoped to [ocmId]) and both values are recorded
--                   in the preserved output: assignmentId 00000000-0000-4000-8000-700000000ac0, periods
--                   2322-01 (PERIOD) and 2322-02 (DRAFT_PERIOD).
--   spine agreement fc500000-0000-4000-8000-0000000a0001         paymentApplication/chargeCorrectionLineage/financialsCardPayments AGREEMENT
--   spine household fc500000-0000-4000-8000-0000000c0001         HOUSEHOLD — both PRE-EXISTING fixture rows (financials-charge-spine.sql)
--   window          2026-10-30T15:52:11.391Z .. 2026-10-30T15:52:32.859Z
--                   broker claim vcl_mvv5hk73_1 acquired / released (validation-claims), the bounds of any
--                   write req_1793375528498836_49075 could make.
--
-- NOT derivable, therefore NOT asked (no guessing): the payment suite's run key (`live-<Date.now()>`, not
-- recorded), the tuition household and the assignment's own rows (read at runtime, not recorded), and
-- every row the tuition cleanup could have deleted org-wide (no identity, no baseline).
--
-- `_before` = present and created before the window (pre-existing); `_during` = created inside the
-- window (attributable to the incident or to anything else that wrote these identities in those 21 s);
-- `_after` = created later. Current absence never proves deletion.
-- =============================================================================
begin transaction read only;

select 'q01_tuition_agreement_before' || '|count|' || count(*)
  from public.child_enrollment_agreements a
 where a.id = '77000000-0000-4000-8000-0000000000a1' and a.org_id = '00000000-0000-4000-8000-000000000001' and a.created_at < '2026-10-30T15:52:11.391Z';

select 'q02_tuition_agreement_during' || '|count|' || count(*)
  from public.child_enrollment_agreements a
 where a.id = '77000000-0000-4000-8000-0000000000a1' and a.org_id = '00000000-0000-4000-8000-000000000001' and a.created_at >= '2026-10-30T15:52:11.391Z' and a.created_at <= '2026-10-30T15:52:32.859Z';

select 'q03_tuition_agreement_after' || '|count|' || count(*)
  from public.child_enrollment_agreements a
 where a.id = '77000000-0000-4000-8000-0000000000a1' and a.org_id = '00000000-0000-4000-8000-000000000001' and a.created_at > '2026-10-30T15:52:32.859Z';

select 'q04_tuition_terms_before' || '|count|' || count(*)
  from public.enrollment_pricing_terms t
 where t.id in ('77000000-0000-4000-8000-0000000000b1', '77000000-0000-4000-8000-0000000000b2') and t.org_id = '00000000-0000-4000-8000-000000000001' and t.enrollment_agreement_id = '77000000-0000-4000-8000-0000000000a1' and t.created_at < '2026-10-30T15:52:11.391Z';

select 'q05_tuition_terms_during' || '|count|' || count(*)
  from public.enrollment_pricing_terms t
 where t.id in ('77000000-0000-4000-8000-0000000000b1', '77000000-0000-4000-8000-0000000000b2') and t.org_id = '00000000-0000-4000-8000-000000000001' and t.enrollment_agreement_id = '77000000-0000-4000-8000-0000000000a1' and t.created_at >= '2026-10-30T15:52:11.391Z' and t.created_at <= '2026-10-30T15:52:32.859Z';

select 'q06_tuition_terms_after' || '|count|' || count(*)
  from public.enrollment_pricing_terms t
 where t.id in ('77000000-0000-4000-8000-0000000000b1', '77000000-0000-4000-8000-0000000000b2') and t.org_id = '00000000-0000-4000-8000-000000000001' and t.enrollment_agreement_id = '77000000-0000-4000-8000-0000000000a1' and t.created_at > '2026-10-30T15:52:32.859Z';

select 'q07_tuition_events_before' || '|count|' || count(*)
  from public.consumption_events e
 where e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and e.created_at < '2026-10-30T15:52:11.391Z';

select 'q08_tuition_events_during' || '|count|' || count(*)
  from public.consumption_events e
 where e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and e.created_at >= '2026-10-30T15:52:11.391Z' and e.created_at <= '2026-10-30T15:52:32.859Z';

select 'q09_tuition_events_after' || '|count|' || count(*)
  from public.consumption_events e
 where e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and e.created_at > '2026-10-30T15:52:32.859Z';

select 'q10_tuition_obligations_before' || '|count|' || count(*)
  from public.resolved_obligations o
  join public.consumption_events e on e.id = o.consumption_event_id
 where o.org_id = '00000000-0000-4000-8000-000000000001' and e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and o.created_at < '2026-10-30T15:52:11.391Z';

select 'q11_tuition_obligations_during' || '|count|' || count(*)
  from public.resolved_obligations o
  join public.consumption_events e on e.id = o.consumption_event_id
 where o.org_id = '00000000-0000-4000-8000-000000000001' and e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and o.created_at >= '2026-10-30T15:52:11.391Z' and o.created_at <= '2026-10-30T15:52:32.859Z';

select 'q12_tuition_obligations_after' || '|count|' || count(*)
  from public.resolved_obligations o
  join public.consumption_events e on e.id = o.consumption_event_id
 where o.org_id = '00000000-0000-4000-8000-000000000001' and e.org_id = '00000000-0000-4000-8000-000000000001' and e.idempotency_key in ('cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-01', 'cev:tuition:00000000-0000-4000-8000-700000000ac0:2322-02') and e.source_entity_id = '77000000-0000-4000-8000-0000000000a1' and o.created_at > '2026-10-30T15:52:32.859Z';

select 'q13_tuition_charges_before' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = '77000000-0000-4000-8000-0000000000a1' and c.created_at < '2026-10-30T15:52:11.391Z';

select 'q14_tuition_charges_during' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = '77000000-0000-4000-8000-0000000000a1' and c.created_at >= '2026-10-30T15:52:11.391Z' and c.created_at <= '2026-10-30T15:52:32.859Z';

select 'q15_tuition_charges_after' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = '77000000-0000-4000-8000-0000000000a1' and c.created_at > '2026-10-30T15:52:32.859Z';

select 'q16_tuition_charges_nondraft_any_time' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = '77000000-0000-4000-8000-0000000000a1' and c.status <> 'draft';

select 'q17_spine_agreement_before' || '|count|' || count(*)
  from public.child_enrollment_agreements a
 where a.id = 'fc500000-0000-4000-8000-0000000a0001' and a.org_id = '00000000-0000-4000-8000-000000000001' and a.created_at < '2026-10-30T15:52:11.391Z';

select 'q18_spine_agreement_any_time' || '|count|' || count(*)
  from public.child_enrollment_agreements a
 where a.id = 'fc500000-0000-4000-8000-0000000a0001' and a.org_id = '00000000-0000-4000-8000-000000000001';

select 'q19_spine_household_any_time' || '|count|' || count(*)
  from public.customers h
 where h.id = 'fc500000-0000-4000-8000-0000000c0001' and h.org_id = '00000000-0000-4000-8000-000000000001';

select 'q20_spine_charges_before' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = 'fc500000-0000-4000-8000-0000000a0001' and c.created_at < '2026-10-30T15:52:11.391Z';

select 'q21_spine_charges_during' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = 'fc500000-0000-4000-8000-0000000a0001' and c.created_at >= '2026-10-30T15:52:11.391Z' and c.created_at <= '2026-10-30T15:52:32.859Z';

select 'q22_spine_charges_after' || '|count|' || count(*)
  from public.charges c
 where c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = 'fc500000-0000-4000-8000-0000000a0001' and c.created_at > '2026-10-30T15:52:32.859Z';

select 'q23_spine_correction_children_during' || '|count|' || count(*)
  from public.charges c
  join public.charges s on s.id = c.source_charge_id
 where c.org_id = '00000000-0000-4000-8000-000000000001' and s.org_id = '00000000-0000-4000-8000-000000000001' and s.billable_source_id = 'fc500000-0000-4000-8000-0000000a0001' and c.created_at >= '2026-10-30T15:52:11.391Z' and c.created_at <= '2026-10-30T15:52:32.859Z';

select 'q24_spine_allocations_during' || '|count|' || count(*)
  from public.payment_allocations pa
  join public.charges c on c.id = pa.charge_id
 where pa.org_id = '00000000-0000-4000-8000-000000000001' and c.org_id = '00000000-0000-4000-8000-000000000001' and c.billable_source_id = 'fc500000-0000-4000-8000-0000000a0001' and pa.created_at >= '2026-10-30T15:52:11.391Z' and pa.created_at <= '2026-10-30T15:52:32.859Z';

select 'q25_spine_household_payments_during' || '|count|' || count(*)
  from public.payments p
 where p.org_id = '00000000-0000-4000-8000-000000000001' and p.customer_id = 'fc500000-0000-4000-8000-0000000c0001' and p.created_at >= '2026-10-30T15:52:11.391Z' and p.created_at <= '2026-10-30T15:52:32.859Z';

select 'q26_spine_household_payments_after' || '|count|' || count(*)
  from public.payments p
 where p.org_id = '00000000-0000-4000-8000-000000000001' and p.customer_id = 'fc500000-0000-4000-8000-0000000c0001' and p.created_at > '2026-10-30T15:52:32.859Z';

select 'q27_spine_household_periods_during' || '|count|' || count(*)
  from public.financial_billing_periods bp
 where bp.org_id = '00000000-0000-4000-8000-000000000001' and bp.customer_id = 'fc500000-0000-4000-8000-0000000c0001' and bp.created_at >= '2026-10-30T15:52:11.391Z' and bp.created_at <= '2026-10-30T15:52:32.859Z';

rollback;

-- CONTROLLED DUE WORK FOR REAL-CLOCK CERTIFICATION.
--
-- Certifying the external clock needs a tick that does actual work, not only ticks
-- that truthfully report nothing due. This seeds exactly one occurrence's worth of
-- it, so the first real tick after activation exercises the whole path:
--   discover due -> claim under lease -> dispatch to a REGISTERED handler ->
--   record outcome -> converge the occurrence.
--
-- THREE DELIBERATE CHOICES:
--
-- 1. It names an ALREADY-REGISTERED handler. Inventing a probe handler would be a
--    runtime code change, which would oblige re-running the generic runtime and
--    three-consumer certification before closure. Reusing a registered consumer
--    costs nothing and proves more: the real dispatch registry, under the real
--    clock. `financials.periodic_billing.evaluate` is non-mutating in V1 — it
--    evaluates and returns completed — so this seeds no financial consequence.
--
-- 2. `one_time`, not a recurrence. A heartbeat schedule would write an occurrence
--    and an attempt row every five minutes forever to answer a question that
--    scheduled_work_clock already answers in one row. This converges once and is
--    then inert.
--
-- 3. `next_due_at` in the PAST, so it is due the moment the clock starts rather
--    than at a timestamp guessed while writing this file. Until a wake runs it
--    simply sits there; it is not a timer of its own.
--
-- org_id is null: this is platform-level probe work belonging to no tenant, which
-- the column allows and which keeps a certification artifact out of tenant data.
--
-- Re-runnable: a failed apply does not roll back DDL already issued, and the
-- guard makes a second apply a no-op rather than a second probe.

insert into public.scheduled_work (org_id, handler_key, recurrence_kind, next_due_at, is_active, label, domain_ref)
select
    null,
    'financials.periodic_billing.evaluate',
    'one_time',
    now() - interval '1 minute',
    true,
    'clock_activation_certification',
    jsonb_build_object(
        'purpose', 'external clock activation certification',
        'mutating', false
    )
where not exists (
    select 1 from public.scheduled_work where label = 'clock_activation_certification'
);

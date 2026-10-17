-- =============================================================================
-- PAYMENTS: RECONCILE PROVIDER-COLLECTED MONEY WHOSE WEBHOOK NEVER ARRIVED.
--
-- A provider can collect and Alloy never hear about it: a webhook delivery that failed past Stripe's
-- retry window, a payer who closed the tab before the browser asked. Recognition could already repair
-- that — re-read the PaymentIntent, post through the one posting authority — but only when an operator
-- or a browser asked, and the operator queue lists only attempts Alloy already believes succeeded. So a
-- provider-successful attempt could stay unapplied indefinitely.
--
-- This registers ONE system-wide schedule (org_id NULL) for the `payments.collection.reconcile`
-- handler, every 15 minutes, on the existing scheduled-work clock. System-wide because the handler acts
-- on each attempt under that attempt's own organization, merchant, charge and payer — and an
-- organization that connects a merchant later is covered without anyone registering it.
--
-- Data only: no table, column, function or policy changes. Re-runnable: inserts only when no schedule
-- for the handler exists.
-- =============================================================================

insert into public.scheduled_work (
    org_id,
    handler_key,
    recurrence_kind,
    interval_seconds,
    next_due_at,
    is_active,
    label,
    domain_ref
)
select
    null,
    'payments.collection.reconcile',
    'interval',
    900,
    now() + interval '5 minutes',
    true,
    'payment_collection_reconciliation',
    jsonb_build_object(
        'purpose', 'post provider-collected money whose webhook never arrived and whose browser never asked',
        'authority', 'recognizeCollectionAttempt -> postProviderConfirmedCollection',
        'provider_truth', 'the PaymentIntent is re-read; cached state is never trusted',
        'scope', 'each attempt under its own org, merchant, charge and payer'
    )
where not exists (
    select 1
      from public.scheduled_work existing
     where existing.handler_key = 'payments.collection.reconcile'
);

do $$
declare
    schedules integer;
    misconfigured integer;
begin
    select count(*) into schedules
      from public.scheduled_work
     where handler_key = 'payments.collection.reconcile';
    if schedules <> 1 then
        raise exception 'payment reconciliation schedule: expected exactly 1, found %', schedules;
    end if;

    select count(*) into misconfigured
      from public.scheduled_work
     where handler_key = 'payments.collection.reconcile'
       and (recurrence_kind <> 'interval' or interval_seconds <> 900 or is_active is not true or org_id is not null);
    if misconfigured > 0 then
        raise exception 'payment reconciliation schedule is misconfigured (% row)', misconfigured;
    end if;
end;
$$;

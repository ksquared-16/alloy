-- ============================================================================================
-- A CHARGE'S RESOLUTION KEY IS UNIQUE WITHIN ITS BILLABLE SOURCE — enforced by the database.
--
-- `writeTemplateDraftCharge` deduped by READING for an existing charge with the same
-- `metadata.resolution_key` and inserting when it found none. Under concurrency that is not
-- dedupe: two runs generating the same month both read nothing and both insert, and the family
-- has two draft charges for one obligation. The consumption event and the resolved obligation
-- were never at risk — `consumption_events` carries a UNIQUE (org_id, idempotency_key) — so the
-- money was the only thing in the pipeline without the guarantee everything around it had.
--
-- This is that same guarantee, not a second mechanism: the key the writer already computes,
-- made unique by the database in the scope the writer already inserts into.
--
-- PARTIAL, deliberately. Only template-resolved childcare charges carry a resolution key; job
-- charges, manual corrections and reversals carry none and are untouched by this index.
-- ============================================================================================

create unique index if not exists charges_resolution_key_unique
    on public.charges (
        org_id,
        billable_source_type,
        billable_source_id,
        ((metadata ->> 'resolution_key'))
    )
    where metadata ->> 'resolution_key' is not null
      and billable_source_id is not null;

comment on index public.charges_resolution_key_unique is
    'One charge per resolution key per billable source. Concurrent generation of the same '
    'occurrence collides here rather than double-billing the family.';

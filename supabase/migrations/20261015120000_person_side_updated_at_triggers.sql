-- Person-side lifecycle clock repair.
--
-- ── WHAT WAS ACTUALLY WRONG ──
--
-- Thread 7 discovery recorded that `locations`, `customer_members` and `customers` lacked a
-- trigger maintaining `updated_at`, and that this blocked incremental delivery of archive and
-- lifecycle state. Re-measurement showed that claim was wrong in both directions.
--
-- Those three tables have carried `set_updated_at` BEFORE UPDATE triggers since the March
-- baseline. What they lack is a `DEFAULT now()` on the column, so a row is born NULL and stays
-- NULL until something first updates it -- a trigger cannot fire for an update that never
-- happened. The external read layer already normalises exactly that case:
--
--     COALESCE(updated_at, created_at) AS sort_key
--
-- which is why 7.1 and 7.2 certified exact incremental sync over a `locations` table with 9 of 10
-- rows NULL. For those tables the coalesce is correct rather than a workaround, and this migration
-- deliberately does NOT touch them.
--
-- The real gap is the six tables below. They have the column and no trigger at all. There an
-- update genuinely happens, `updated_at` genuinely stays NULL, and the coalesce falls back to a
-- creation time in the past -- so a consumer already synced beyond that point never learns the
-- change occurred. `persons.archived_at` is the mutation most likely to be lost this way, which is
-- the worst one to lose: a retired person would remain live in every partner's mirror forever.
--
-- ── WHY THERE IS NO BACKFILL ──
--
-- None is needed and one would be harmful. `COALESCE(updated_at, created_at)` already represents a
-- never-updated row truthfully by its creation time. Restamping the existing NULLs with `now()`
-- would assert that 1,800+ people changed today, and every partner's first incremental pass would
-- redeliver the entire dataset. Existing history is left exactly as it is: `created_at` remains the
-- bootstrap clock, and only genuine future mutations advance `updated_at`.
--
-- No new columns. No deletion ledger. No data rewrite. Six triggers, and nothing else.
--
-- Re-runnable: a failed apply does not roll back DDL, so every statement drops first.

BEGIN;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'persons',
        'customer_persons',
        'customer_member_contacts',
        'customer_member_contact_roles',
        'person_relationships',
        'person_locations'
    ]
    LOOP
        -- Guard rather than assume: if a table or its column is ever removed, this migration
        -- should become a no-op for that entry instead of failing the whole apply.
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at'
        ) THEN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_updated_at', t);
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE ON public.%I '
                'FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
                'trg_' || t || '_updated_at', t
            );
        END IF;
    END LOOP;
END
$$;

-- Prove the intent inside the migration, so a partial apply cannot report success.
DO $$
DECLARE
    missing text;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM unnest(ARRAY[
        'persons','customer_persons','customer_member_contacts',
        'customer_member_contact_roles','person_relationships','person_locations'
    ]) AS t
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_trigger tg
        JOIN pg_class cl ON cl.oid = tg.tgrelid
        JOIN pg_namespace n ON n.oid = cl.relnamespace
        JOIN pg_proc p ON p.oid = tg.tgfoid
        WHERE n.nspname = 'public' AND cl.relname = t AND NOT tg.tgisinternal
          AND (tg.tgtype & 2) > 0 AND (tg.tgtype & 16) > 0
          AND p.proname = 'set_updated_at'
    );

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'person-side updated_at trigger missing after apply: %', missing;
    END IF;
END
$$;

COMMIT;

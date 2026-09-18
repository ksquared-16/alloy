-- P0-7.6 · RETIRE THE ABANDONED STEP 1 PAYLOAD PROJECTION (certification only)
--
-- ── WHAT THIS REMOVES, AND WHY IT EXISTS AT ALL ──
--
-- `20260917120000_org_config_projection_v1.sql` built a durable per-org configuration PAYLOAD
-- projection: one table, seven invalidation triggers and two trigger functions. The convergence audit
-- that followed rejected the design before it shipped — Alloy already had a canonical freshness
-- authority in org-scoped Next Data Cache tags, and a stored projection would have done the same job
-- worse, because it must be READ on the request path where a tag is consulted inside the cache.
--
-- Step 1-prime replaced it: `bumpOrgConfigFreshness` publishes freshness to the caches that already
-- exist, stores no payload and adds no layer.
--
-- The rejected migration was applied to the **alloy-cert** certification stack only. It never reached
-- staging or production. So on every environment except cert this migration is a no-op, and on cert it
-- removes an architecture nothing consumes. `IF EXISTS` throughout is deliberate: this must be safe to
-- run where the objects were never created.
--
-- ── THE HISTORY IS SUPERSEDED, NOT ERASED ──
--
-- The original migration file stays in the tree and in the ledger. A reader must be able to see that
-- the payload design existed, was certified, was rejected on architecture grounds, and was retired —
-- rather than find a gap where an experiment used to be. This file is the retirement record.
--
-- ── NO REPLACEMENT SCHEMA ──
--
-- Nothing is created here. Step 1-prime's freshness authority is entirely application-level; if this
-- migration appears to need a replacement table, that is the signal the rejected design is coming back.

-- Triggers first: they reference the function, and the function is dropped below.
DROP TRIGGER IF EXISTS trg_ocp_stale_option_sets ON public.option_sets;
DROP TRIGGER IF EXISTS trg_ocp_stale_location_program_categories ON public.location_program_categories;
DROP TRIGGER IF EXISTS trg_ocp_stale_status_definitions ON public.status_definitions;
DROP TRIGGER IF EXISTS trg_ocp_stale_gl_accounts ON public.gl_accounts;
DROP TRIGGER IF EXISTS trg_ocp_stale_gl_account_mappings ON public.gl_account_mappings;
DROP TRIGGER IF EXISTS trg_ocp_stale_financial_charge_templates ON public.financial_charge_templates;
DROP TRIGGER IF EXISTS trg_ocp_stale_option_set_items ON public.option_set_items;

DROP FUNCTION IF EXISTS public.mark_org_config_projection_stale();
DROP FUNCTION IF EXISTS public.mark_org_config_projection_stale_option_set_item();

-- The payload table last. Its RLS policies and indexes go with it.
DROP TABLE IF EXISTS public.org_config_projections;

DO $retire$
DECLARE
    v_triggers integer;
    v_functions integer;
BEGIN
    IF to_regclass('public.org_config_projections') IS NOT NULL THEN
        RAISE EXCEPTION 'RETIRE ABORT: org_config_projections still exists';
    END IF;

    SELECT count(*) INTO v_triggers
      FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'trg_ocp_stale_%';
    IF v_triggers <> 0 THEN
        RAISE EXCEPTION 'RETIRE ABORT: % abandoned trg_ocp_stale_* triggers survive', v_triggers;
    END IF;

    SELECT count(*) INTO v_functions
      FROM pg_proc WHERE proname LIKE 'mark_org_config_projection_stale%';
    IF v_functions <> 0 THEN
        RAISE EXCEPTION 'RETIRE ABORT: % abandoned trigger functions survive', v_functions;
    END IF;

    -- The families the abandoned triggers hung off must be untouched. Dropping a trigger must not have
    -- taken its table with it.
    IF to_regclass('public.status_definitions') IS NULL
       OR to_regclass('public.location_program_categories') IS NULL
       OR to_regclass('public.option_sets') IS NULL THEN
        RAISE EXCEPTION 'RETIRE ABORT: a canonical configuration table is missing after retirement';
    END IF;
END $retire$;

-- =============================================================================
-- Trust Runtime — lifecycle observation vocabulary, additive extension.
--
-- Phase 0 Slice 0.4. Adds `expired` and `superseded` to the append-only
-- observation vocabulary so that expiry and supersession can be represented as
-- OBSERVATIONS REFERENCING an immutable Decision Package, rather than as mutable
-- state on the package row.
--
-- This is the whole of the change. Deliberately NOT in this migration:
--
--   * no column is added to `trust_decision_packages` — Decision 020 forbids a
--     mutable post-creation lifecycle on the package, and an `is_expired` or
--     `superseded_at` column would be exactly that;
--   * no existing observation kind is removed or renamed;
--   * no grant, policy, RLS setting or trigger is altered. The verification
--     block below asserts that, so a future edit that quietly relaxes a
--     privilege fails here rather than in production.
--
-- Mechanically a CHECK constraint cannot be "extended", so it is dropped and
-- recreated with a superset. The verification block proves the superset
-- relationship: all eight prior values plus the two new ones, and nothing lost.
--
-- Replay-safe: `DROP CONSTRAINT IF EXISTS` then `ADD`, so re-running against an
-- already-migrated database converges to the same end state.
--
-- @see docs/platform/trust/trust-platform-decisions.md — Decision 020
-- @see supabase/migrations/20260802090000_trust_runtime_v1_foundation.sql
-- =============================================================================

BEGIN;

ALTER TABLE public.trust_decision_observations
    DROP CONSTRAINT IF EXISTS chk_tdo_kind;

ALTER TABLE public.trust_decision_observations
    ADD CONSTRAINT chk_tdo_kind CHECK (observation_kind = ANY (ARRAY[
        -- ---- unchanged, from 20260802090000 --------------------------------
        'presented'::text,
        'accepted'::text,
        'rejected'::text,
        'overridden'::text,
        'modified'::text,
        'deferred'::text,
        'executed'::text,
        'outcome'::text,
        -- ---- added by this migration ---------------------------------------
        -- The recommendation's window closed before it was acted on. `detail`
        -- carries `expiry_kind` (scheduled | policy | stale_context |
        -- administrative) so the cause is auditable.
        'expired'::text,
        -- A newer Decision Package replaced this one. `detail` carries
        -- `superseding_package_id`, which must name a package in the same org
        -- and may never name this package. The predecessor is never edited.
        'superseded'::text
    ]));

COMMENT ON CONSTRAINT chk_tdo_kind ON public.trust_decision_observations IS
    'Closed lifecycle observation vocabulary. Extended additively by 20260804210000 with expired and superseded; no prior value has ever been removed.';

-- -----------------------------------------------------------------------------
-- Verification. The migration proves its own claims, so the check cannot drift
-- from the change.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    v_def text;
    v_kind text;
    v_expected text[] := ARRAY[
        'presented', 'accepted', 'rejected', 'overridden', 'modified',
        'deferred', 'executed', 'outcome', 'expired', 'superseded'
    ];
    v_missing text[] := ARRAY[]::text[];
    v_write_grants integer;
    v_anon_grants integer;
    v_select_grants integer;
    v_rls boolean;
    v_triggers integer;
    v_policies integer;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
    WHERE conname = 'chk_tdo_kind'
      AND conrelid = 'public.trust_decision_observations'::regclass;

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'chk_tdo_kind is missing after the additive extension';
    END IF;

    -- Every value, old and new, must be admitted.
    FOREACH v_kind IN ARRAY v_expected LOOP
        IF position('''' || v_kind || '''' IN v_def) = 0 THEN
            v_missing := v_missing || v_kind;
        END IF;
    END LOOP;
    IF array_length(v_missing, 1) IS NOT NULL THEN
        RAISE EXCEPTION 'chk_tdo_kind lost or omitted observation kind(s): %', array_to_string(v_missing, ', ');
    END IF;

    -- ---- privileges are untouched -------------------------------------------
    SELECT count(*) INTO v_anon_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'trust_decision_observations' AND grantee = 'anon';
    IF v_anon_grants <> 0 THEN
        RAISE EXCEPTION 'trust_decision_observations: anon holds % grant(s); expected none', v_anon_grants;
    END IF;

    SELECT count(*) INTO v_write_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'trust_decision_observations'
      AND grantee = 'authenticated' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE');
    IF v_write_grants <> 0 THEN
        RAISE EXCEPTION 'trust_decision_observations: authenticated holds % write grant(s); expected none', v_write_grants;
    END IF;

    SELECT count(*) INTO v_select_grants
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'trust_decision_observations'
      AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    IF v_select_grants <> 1 THEN
        RAISE EXCEPTION 'trust_decision_observations: authenticated SELECT grant count is %; expected 1', v_select_grants;
    END IF;

    -- ---- RLS, policies and append-only enforcement are untouched -------------
    SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.trust_decision_observations'::regclass;
    IF NOT v_rls THEN
        RAISE EXCEPTION 'trust_decision_observations: row level security is no longer enabled';
    END IF;

    SELECT count(*) INTO v_policies FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'trust_decision_observations';
    IF v_policies < 1 THEN
        RAISE EXCEPTION 'trust_decision_observations: expected at least one RLS policy, found %', v_policies;
    END IF;

    SELECT count(*) INTO v_triggers FROM pg_trigger
    WHERE tgrelid = 'public.trust_decision_observations'::regclass
      AND NOT tgisinternal
      AND tgname IN ('trg_trust_decision_observation_append_only', 'trg_trust_observation_tenancy');
    IF v_triggers < 1 THEN
        RAISE EXCEPTION 'trust_decision_observations: append-only / tenancy triggers are missing (found %)', v_triggers;
    END IF;

    RAISE NOTICE 'Trust lifecycle observation vocabulary verified — 10 kinds admitted, privileges unchanged (anon: none, authenticated: SELECT only), RLS on, append-only enforced.';
END;
$$;

COMMIT;

-- =============================================================================
-- Trust Runtime V1 — privilege correction
-- =============================================================================
-- CERTIFICATION FINDING (full-chain replay, 2026-08-03).
--
-- `20260802090000_trust_runtime_v1_foundation.sql` states its intent in a
-- comment: "Read only for authenticated. No INSERT/UPDATE/DELETE grant."
-- Against the isolated fixture that held. Against the FULL migration chain it
-- did not, and assertion 21 of the certification suite failed:
--
--     CERT FAIL 21: authenticated holds 12 write grant(s) on Trust tables
--
-- Cause. Supabase's schema-wide default privileges —
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES
--     TO anon, authenticated, service_role
-- (owned by `supabase_admin` AND `postgres`) — are applied at CREATE TABLE
-- time, before any statement in the foundation migration runs. `GRANT SELECT`
-- afterwards is therefore a no-op: the roles already held ALL. The Trust
-- migration never REVOKED what the schema-wide default had already given.
--
-- Nothing was exploitable. RLS is enabled on all four tables and the only
-- policies are SELECT-scoped to the caller's org, so every write from a client
-- role is refused regardless of the grant (certification assertion F16 proves
-- this against a real seeded operator). But a privilege the platform never
-- intended to issue is a latent one: any future policy — an INSERT policy added
-- for an unrelated feature, or `FORCE ROW LEVEL SECURITY` being relaxed —
-- would silently become writable by `anon`. Defence in depth means the GRANT
-- must agree with the intent, not merely be masked by RLS.
--
-- THIS MIGRATION MAKES THE DATABASE MATCH THE STATED INTENT.
--
--   anon          → nothing at all. An unauthenticated caller has no business
--                   reading or writing a decision audit record.
--   authenticated → SELECT only. RLS narrows that to the caller's own org.
--   service_role  → ALL. Writes are server-authoritative and bypass RLS by
--                   design; this is the only role that may create a Decision
--                   Contract, Package, Observation or usage row.
--
-- SCOPE. Four tables. This migration deliberately does NOT alter the
-- schema-wide default privileges, and does not touch the other 249 tables in
-- `public` that inherit the same condition. Changing a platform-wide default is
-- a platform security decision with 253-table blast radius; it is recorded as a
-- separate finding and is not smuggled in under a Trust migration.
--
-- Idempotent and additive. No table, column, policy, trigger or index is
-- altered. Re-running it is a no-op.
-- =============================================================================

DO $privileges$
DECLARE
    v_table text;
    c_tables text[] := ARRAY[
        'trust_decision_contracts',
        'trust_decision_packages',
        'trust_decision_observations',
        'trust_reasoning_usage'
    ];
BEGIN
    FOREACH v_table IN ARRAY c_tables LOOP
        -- anon holds nothing. Revoking ALL also clears the SELECT that the
        -- schema default granted.
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_table);

        -- authenticated: strip everything the default granted, then re-grant
        -- exactly the one privilege the foundation migration intended.
        EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v_table);
        EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v_table);

        -- service_role is the write authority. Restated so the end state is
        -- declared here in full rather than inferred from an earlier migration.
        EXECUTE format('GRANT ALL ON public.%I TO service_role', v_table);
    END LOOP;
END
$privileges$;

-- =============================================================================
-- Self-verification. The migration refuses to succeed unless the end state is
-- exactly the intended one — the check cannot drift away from the change.
-- =============================================================================
DO $verify$
DECLARE
    v_bad integer;
    v_sel integer;
    c_tables text[] := ARRAY[
        'trust_decision_contracts',
        'trust_decision_packages',
        'trust_decision_observations',
        'trust_reasoning_usage'
    ];
BEGIN
    -- anon holds nothing whatsoever.
    SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ANY(c_tables) AND grantee = 'anon';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'PRIVILEGE FAIL: anon still holds % grant(s) on Trust tables', v_bad;
    END IF;

    -- authenticated holds no write privilege of any kind.
    SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ANY(c_tables) AND grantee = 'authenticated'
      AND privilege_type <> 'SELECT';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'PRIVILEGE FAIL: authenticated still holds % non-SELECT grant(s) on Trust tables', v_bad;
    END IF;

    -- authenticated retains SELECT on all four — the operator must still be able
    -- to read the decision record that explains a recommendation.
    SELECT count(*) INTO v_sel
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ANY(c_tables) AND grantee = 'authenticated'
      AND privilege_type = 'SELECT';
    IF v_sel <> 4 THEN
        RAISE EXCEPTION 'PRIVILEGE FAIL: authenticated holds SELECT on % of 4 Trust tables', v_sel;
    END IF;

    -- service_role keeps full write authority, or the runtime cannot persist.
    SELECT count(*) INTO v_sel
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = ANY(c_tables) AND grantee = 'service_role'
      AND privilege_type IN ('SELECT','INSERT','UPDATE','DELETE');
    IF v_sel <> 16 THEN
        RAISE EXCEPTION 'PRIVILEGE FAIL: service_role holds % of the expected 16 CRUD grants on Trust tables', v_sel;
    END IF;

    RAISE NOTICE 'Trust privilege correction verified — anon: none, authenticated: SELECT only, service_role: full';
END
$verify$;

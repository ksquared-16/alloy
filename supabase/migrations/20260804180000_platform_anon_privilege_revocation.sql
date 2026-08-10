-- =============================================================================
-- Platform security — remove latent anonymous access to the public schema
-- =============================================================================
-- Issue #318 (A). Platform-owned. This is NOT a Trust Runtime migration.
--
-- CONDITION. Supabase applies schema-wide default privileges before any
-- repository migration runs:
--
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public
--       GRANT ALL ON TABLES / SEQUENCES / FUNCTIONS
--       TO anon, authenticated, service_role;
--
-- for BOTH the `supabase_admin` and `postgres` default-ACL owners. Every object
-- created in `public` therefore grants itself to `anon` at birth. Measured on a
-- from-empty replay of the 308-migration chain at staging 4888371af:
--
--     231 tables/views  → anon holds SELECT, INSERT, UPDATE, DELETE,
--                         TRUNCATE, REFERENCES, TRIGGER
--     126 of 128 functions → anon holds EXECUTE (34 of them SECURITY DEFINER)
--     default ACLs      → future tables, sequences AND functions all inherit it
--
-- WHY THIS IS WORTH FIXING EVEN THOUGH NOTHING IS EXPLOITABLE TODAY.
-- RLS is enabled on 253/253 public base tables, and every policy expression is
-- gated on `auth.uid()` membership or `auth.role() = 'service_role'`. For `anon`
-- `auth.uid()` is NULL, so every policy evaluates false. Probed directly: an
-- anon INSERT into `public.field_definitions` is refused with "new row violates
-- row-level security policy", and an anon SELECT of `public.persons` returns 0
-- rows.
--
-- So this is latent, not live — and that is exactly the point. A single future
-- change (one permissive INSERT policy added for an unrelated feature, one table
-- shipped with RLS not yet enabled, one `FORCE ROW LEVEL SECURITY` relaxed)
-- silently converts an unused grant into an unauthenticated write path. The
-- 34 SECURITY DEFINER functions anon can currently EXECUTE are a second such
-- surface, where the caller's lack of privilege is not what protects the data.
-- Defence in depth means an unauthenticated role holds nothing it does not need.
--
-- WHAT THIS MIGRATION DOES NOT DO.
--   * It does not touch `authenticated` — not one grant, not one policy. Those
--     ~300 org-scoped write policies were authored deliberately and represent an
--     architecture decision that is explicitly out of scope here (Issue #318 B).
--   * It does not touch `service_role`, which is the application's entire data
--     path (`lib/supabaseAdmin.ts`).
--   * It does not alter any RLS policy, table, column, or application code.
--
-- APPROVED ANONYMOUS SURFACE, enumerated from the repository rather than
-- assumed:
--   * `USAGE` on schema `public` — retained. Without it `anon` cannot reach the
--     approved RPC at all, and PostgREST cannot resolve the route.
--   * `EXECUTE` on `public.get_quote_pricing` — retained. It is the only
--     function called through the browser client (`lib/pricing/supabasePricing.ts`
--     via `lib/supabaseClient.ts`), and it is SECURITY DEFINER, so it reads the
--     pricing tables under the definer's rights and is unaffected by the table
--     revokes below.
--   * Supabase Auth (`/auth/v1/*`) is unaffected: it operates in the `auth`
--     schema under `supabase_auth_admin`, and needs no `public` privilege.
--
-- Everything else anonymous is removed. Idempotent; re-running is a no-op.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FUTURE OBJECTS — stop the bleeding at the source.
--
-- The default-ACL owner that matters most is `postgres`: repository migrations
-- run as `postgres`, so every table this repo creates from here on inherits the
-- `postgres` defaults. `supabase_admin` is corrected too where permitted — a
-- migration is not always a member of that role, so it is attempted and its
-- outcome reported rather than assumed. Assertion 4 below proves the `postgres`
-- defaults are clean, which is the load-bearing half.
-- -----------------------------------------------------------------------------
DO $future$
DECLARE
    v_role text;
    v_ok boolean;
BEGIN
    FOREACH v_role IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            RAISE NOTICE 'default-ACL owner % does not exist here — skipped', v_role;
            CONTINUE;
        END IF;
        v_ok := true;
        BEGIN
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM anon', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon', v_role);
            EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon', v_role);
        EXCEPTION WHEN insufficient_privilege THEN
            v_ok := false;
            RAISE NOTICE 'insufficient privilege to alter default ACLs for role % — existing objects are still corrected below', v_role;
        END;
        IF v_ok THEN
            RAISE NOTICE 'default privileges for role % in schema public no longer grant to anon', v_role;
        END IF;
    END LOOP;
END
$future$;

-- -----------------------------------------------------------------------------
-- 1b. BASELINE CAPTURE — what `authenticated` and `service_role` can execute
--     RIGHT NOW, before anything is revoked.
--
-- Checks (8) and (9) below prove this migration did not narrow either role's
-- EXECUTE surface. They originally asserted absolute totals (126 / 128) measured
-- on a from-empty replay of the chain. That is environment-fragile: staging has
-- 136 functions executable by `authenticated`, entirely legitimately, because
-- migrations merged after that baseline added more. The assertion failed there
-- and blocked every later migration — while proving nothing about preservation,
-- since a total cannot distinguish "unchanged" from "lost one, gained one".
--
-- Bumping 126 → 136 would only move the same trap to the next function added.
-- The real invariant is a SET comparison against this environment's own
-- pre-migration state, which holds on a from-empty database and on a long-lived
-- one alike, and needs no maintenance when a function is legitimately added.
--
-- Captured by oid, so overloads are distinct identities rather than a name.
--
-- A plain TEMP table (not ON COMMIT DROP): the verify block reads it before the
-- transaction commits, and ON COMMIT DROP would remove it immediately if this
-- file were ever run outside an explicit transaction block. It is dropped
-- explicitly at the end, and is session-scoped regardless, so nothing persists.
-- -----------------------------------------------------------------------------
DROP TABLE IF EXISTS _anon_rev_execute_baseline;
CREATE TEMP TABLE _anon_rev_execute_baseline AS
SELECT r.rolname::text AS grantee, p.oid AS fn
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
CROSS JOIN (VALUES ('authenticated'), ('service_role')) AS r(rolname)
WHERE n.nspname = 'public'
  AND has_function_privilege(r.rolname, p.oid, 'EXECUTE');

-- -----------------------------------------------------------------------------
-- 2. EXISTING OBJECTS — remove what was already granted.
--
-- `ALL TABLES` covers ordinary tables and views (there are 4 views and 0
-- materialized views in `public`). There are currently 0 sequences and 0
-- procedures, but both are revoked anyway so the statement remains correct as
-- the schema grows.
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM anon;

-- THE PUBLIC PSEUDO-ROLE IS THE PART THAT ACTUALLY MATTERS FOR FUNCTIONS.
--
-- Revoking from `anon` alone is not enough, and the first run of this migration
-- proved it: verification failed with "anon can execute 94 non-approved
-- function(s)". PostgreSQL grants EXECUTE to PUBLIC on every function by
-- default, which appears in `proacl` as a leading `=X/postgres` entry. `anon`
-- inherits EXECUTE through PUBLIC, so revoking anon's own entry leaves the
-- privilege intact. 94 of the 128 functions in `public` carry that entry, and
-- 34 of the functions anon could reach are SECURITY DEFINER.
--
-- Revoking from PUBLIC is safe for the two roles this mission must not touch,
-- and that is measured rather than assumed:
--
--     authenticated   126 effective EXECUTE / 126 EXPLICIT grants
--     service_role    128 effective EXECUTE / 128 EXPLICIT grants
--
-- Every grant they hold is explicit, so neither depends on the PUBLIC entry and
-- neither is affected by removing it. Assertions 8 and 9 re-verify those exact
-- counts afterwards. Tables need no equivalent treatment: 0 tables or views in
-- `public` carry a PUBLIC ACL entry.
REVOKE ALL ON ALL ROUTINES IN SCHEMA public FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- 3. RESTORE THE APPROVED ANONYMOUS SURFACE.
--
-- Granted by name, so the approved list is a visible allowlist in this file
-- rather than an accident of what happened not to be revoked.
-- -----------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon;

DO $approved$
DECLARE
    v_sig text;
    v_count integer := 0;
BEGIN
    FOR v_sig IN
        SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid))
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_quote_pricing'
    LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', v_sig);
        v_count := v_count + 1;
    END LOOP;
    IF v_count = 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL: public.get_quote_pricing not found — the approved anonymous RPC would be unreachable';
    END IF;
    RAISE NOTICE 'approved anonymous RPC restored: % overload(s) of public.get_quote_pricing', v_count;
END
$approved$;

-- =============================================================================
-- 4. SELF-VERIFICATION — the migration refuses to succeed unless the end state
--    is exactly the intended one, including the guarantee that `authenticated`
--    and `service_role` were not touched.
-- =============================================================================
DO $verify$
DECLARE
    v_bad integer;
    v_auth integer;
    v_svc integer;
    v_auth_fn integer;
    v_svc_fn integer;
BEGIN
    -- (1) anon holds no privilege on any table or view in public.
    SELECT count(*) INTO v_bad
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 1: anon still holds % table grant(s) in public', v_bad;
    END IF;

    -- (2) anon holds no sequence privilege.
    SELECT count(*) INTO v_bad
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S'
      AND (has_sequence_privilege('anon', c.oid, 'USAGE')
        OR has_sequence_privilege('anon', c.oid, 'SELECT')
        OR has_sequence_privilege('anon', c.oid, 'UPDATE'));
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 2: anon can still use % sequence(s) in public', v_bad;
    END IF;

    -- (3) the ONLY function anon may execute is the approved RPC.
    SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.proname <> 'get_quote_pricing';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 3: anon can execute % non-approved function(s) in public', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_quote_pricing'
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    IF v_bad = 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 3b: the approved anonymous RPC is no longer executable by anon';
    END IF;

    -- (4) future objects created by `postgres` no longer grant to anon.
    SELECT count(*) INTO v_bad
    FROM pg_default_acl d JOIN pg_namespace n ON n.oid = d.defaclnamespace
    WHERE n.nspname = 'public'
      AND d.defaclrole = 'postgres'::regrole
      AND array_to_string(d.defaclacl, ',') LIKE '%anon=%';
    IF v_bad <> 0 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 4: % postgres default-ACL entr(ies) in public still grant to anon', v_bad;
    END IF;

    -- (5) anon keeps schema USAGE, or the approved RPC is unreachable.
    IF NOT has_schema_privilege('anon', 'public', 'USAGE') THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 5: anon lost USAGE on schema public — the approved RPC would be unreachable';
    END IF;

    -- (6) UNTOUCHED-BY-CONSTRUCTION CHECK. This migration must not have narrowed
    --     `authenticated` or `service_role`. Both must still hold the broad table
    --     grants they had before it ran. If either count collapses, something in
    --     this file reached further than intended and the migration fails closed.
    SELECT count(DISTINCT table_name) INTO v_auth
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'authenticated' AND privilege_type = 'SELECT';
    IF v_auth < 200 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 6: authenticated SELECT dropped to % tables — this migration must not modify authenticated', v_auth;
    END IF;

    SELECT count(DISTINCT table_name) INTO v_svc
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'service_role' AND privilege_type = 'INSERT';
    IF v_svc < 200 THEN
        RAISE EXCEPTION 'ANON PRIVILEGE FAIL 7: service_role INSERT dropped to % tables — the application data path would break', v_svc;
    END IF;

    -- (8)/(9) EXECUTE preservation. Revoking the PUBLIC entry must not have
    --     changed what `authenticated` or `service_role` can execute.
    --
    --     Compared as a SET against this environment's own pre-migration state
    --     (captured in section 1b), not against a hardcoded total. `REVOKE ...
    --     FROM PUBLIC` can only remove privilege, and PUBLIC grants flow to
    --     every role, so a loss here is the real hazard — and a loss is exactly
    --     what a count can hide when something is gained in the same breath.
    --     Losses are named by `regprocedure`, which carries the full overload
    --     signature, so the failure says which function rather than how many.
    DECLARE
        v_lost_auth text;
        v_lost_svc  text;
    BEGIN
        SELECT string_agg(b.fn::regprocedure::text, ', ' ORDER BY b.fn::regprocedure::text)
          INTO v_lost_auth
        FROM _anon_rev_execute_baseline b
        WHERE b.grantee = 'authenticated'
          AND NOT has_function_privilege('authenticated', b.fn, 'EXECUTE');
        IF v_lost_auth IS NOT NULL THEN
            RAISE EXCEPTION 'ANON PRIVILEGE FAIL 8: authenticated lost EXECUTE on %s — this migration must not modify authenticated', v_lost_auth;
        END IF;

        SELECT string_agg(b.fn::regprocedure::text, ', ' ORDER BY b.fn::regprocedure::text)
          INTO v_lost_svc
        FROM _anon_rev_execute_baseline b
        WHERE b.grantee = 'service_role'
          AND NOT has_function_privilege('service_role', b.fn, 'EXECUTE');
        IF v_lost_svc IS NOT NULL THEN
            RAISE EXCEPTION 'ANON PRIVILEGE FAIL 9: service_role lost EXECUTE on %s — the application data path would break', v_lost_svc;
        END IF;
    END;

    SELECT count(*) INTO v_auth_fn FROM _anon_rev_execute_baseline WHERE grantee = 'authenticated';
    SELECT count(*) INTO v_svc_fn  FROM _anon_rev_execute_baseline WHERE grantee = 'service_role';

    RAISE NOTICE 'EXECUTE preserved — authenticated % functions, service_role % functions (every pre-migration grant still held)', v_auth_fn, v_svc_fn;

    RAISE NOTICE 'anon privilege revocation verified — anon: 0 table grants, 0 sequence privileges, 1 approved RPC, schema USAGE retained';
    RAISE NOTICE 'untouched confirmed — authenticated SELECT on % tables, service_role INSERT on % tables', v_auth, v_svc;
END
$verify$;

-- The baseline was scaffolding for the preservation proof above; it is session
-- scoped, but dropped explicitly so nothing is left for a later statement to see.
DROP TABLE IF EXISTS _anon_rev_execute_baseline;

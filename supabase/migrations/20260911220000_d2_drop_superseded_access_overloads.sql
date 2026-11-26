-- D2 — DROP THE SUPERSEDED SIGNATURES. `CREATE OR REPLACE` DID NOT REPLACE THEM.
--
-- Adding DEFAULTed parameters does not replace a function: it creates a SECOND one. Both overloads
-- then exist, and PostgREST cannot choose between them for a three-argument call:
--
--   PGRST203  Could not choose the best candidate function between:
--             public.replace_role_permission_grants(p_org_id => uuid, p_role_key => text, p_permission_keys => text[]),
--             public.replace_role_permission_grants(p_org_id => uuid, …, p_actor_user_id => text, p_origin => text, p_correlation_id => text)
--
-- Every existing caller broke — not with a wrong answer, with a hard refusal. `20260911200000` and
-- `20260911210000` were both written as if the wider signature displaced the narrower one, and the
-- live revocation test is what proved otherwise.
--
-- The narrow forms are dropped rather than kept as compatibility shims. Keeping them would leave an
-- unaudited path to the same mutation, which is the whole thing D2 exists to close: a caller could
-- change access through the three-argument function and produce no event at all. The wide forms take
-- DEFAULTs for the audit parameters, so a genuine three-argument call still resolves — it simply
-- resolves to the function that refuses to change access without naming an actor.

DO $preflight$
BEGIN
    IF to_regprocedure('public.replace_role_permission_grants(uuid, text, text[], text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: the audited grants producer is absent; dropping the narrow form would remove the only implementation.';
    END IF;
    IF to_regprocedure('public.save_role_definition_and_grants(uuid, text, text, boolean, text[], text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: the audited role-save producer is absent.';
    END IF;
    IF to_regprocedure('public.replace_membership_with_access_profile(uuid, uuid, text, text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'D2 ABORT: the audited membership producer is absent.';
    END IF;
END
$preflight$;

DROP FUNCTION IF EXISTS public.replace_role_permission_grants(uuid, text, text[]);
DROP FUNCTION IF EXISTS public.save_role_definition_and_grants(uuid, text, text, boolean, text[]);
DROP FUNCTION IF EXISTS public.replace_membership_with_access_profile(uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- Assert exactly one overload of each remains, so a later migration that adds a
-- parameter cannot recreate this failure quietly.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
    v_name text;
    v_count int;
BEGIN
    FOREACH v_name IN ARRAY ARRAY[
        'replace_role_permission_grants',
        'save_role_definition_and_grants',
        'replace_membership_with_access_profile',
        'create_role_definition_audited',
        'remove_member_access_audited',
        'replace_member_access_scope_audited'
    ] LOOP
        SELECT count(*) INTO v_count
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = v_name;

        IF v_count <> 1 THEN
            RAISE EXCEPTION
                'D2 ABORT: public.% has % overloads; PostgREST cannot choose between them and every caller fails with PGRST203.',
                v_name, v_count;
        END IF;
    END LOOP;

    RAISE NOTICE 'D2: one signature per access producer; no ambiguous overloads remain.';
END
$assert$;

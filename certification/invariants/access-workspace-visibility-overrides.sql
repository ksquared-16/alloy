-- Access V3 S5 — workspace visibility overrides: POST-APPLY invariant (rollback-only).
--
-- For `database.run_rollback_invariant_test` against the SAME isolated certification environment, AFTER
-- `database.apply_migration` of 20261222110000. The runner wraps this file in a transaction and rolls it back, so nothing
-- persists. Not for the shared stack, staging or production.
--
-- CASE 0 reads the ledger and the objects SEPARATELY (an apply's own "applied" result is not proof of either), then
-- CASES 1-10 — identical to the pre-apply invariant — prove the approved disposition (erun2_710f8569c9515f09)
-- against the applied schema.

-- CASE 0 — applied: the ledger row AND every object exist.
DO $applied$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261222110000') THEN
        RAISE EXCEPTION 'CASE 0 FAILED: ledger does not record 20261222110000';
    END IF;
    IF to_regclass('public.workspace_visibility_overrides') IS NULL
       OR to_regprocedure('public.set_workspace_visibility_override(uuid, uuid, text[], text, text, text)') IS NULL
       OR to_regprocedure('public.clear_workspace_visibility_override(uuid, uuid, text, text, text)') IS NULL THEN
        RAISE EXCEPTION 'CASE 0 FAILED: ledger records 20261222110000 but an object it creates is missing';
    END IF;
END
$applied$;

-- ── The cases ────────────────────────────────────────────────────────────────────────────────────────────────────
-- Disposable subjects only: two orgs and two auth users created here and discarded with the transaction. Every
-- refusal has a control — the same operation with only the defect removed succeeds — so a refusal cannot pass by
-- broken setup. Refused statements run in their own sub-block; the role and any partial effect revert with it.
DO $wvo$
DECLARE
    o1 constant uuid := 'a5a50000-5e00-4000-8000-0000000000a1';
    o2 constant uuid := 'a5a50000-5e00-4000-8000-0000000000a2';
    u1 constant uuid := 'a5a50000-5e00-4000-8000-0000000000b1';
    u2 constant uuid := 'a5a50000-5e00-4000-8000-0000000000b2';
    v_changed boolean;
    v_keys text[];
    v_n integer;
    v_ev record;
    v_fks text[];
    passed integer := 0;
BEGIN
    -- Fixed disposable identifiers (the residue invariant checks exactly these). Any pre-existing row means an earlier
    -- run persisted something, so refuse rather than run on top of it.
    IF EXISTS (SELECT 1 FROM public.orgs WHERE id IN (o1, o2) OR slug IN ('zz-wvo-a', 'zz-wvo-b'))
       OR EXISTS (SELECT 1 FROM auth.users WHERE id IN (u1, u2) OR email IN ('zz-wvo-u1@example.invalid', 'zz-wvo-u2@example.invalid')) THEN
        RAISE EXCEPTION 'SETUP FAILED: disposable wvo identifiers already exist (residue from an earlier run)';
    END IF;
    INSERT INTO public.orgs (id, name, slug) VALUES
        (o1, 'ZZ wvo A', 'zz-wvo-a'),
        (o2, 'ZZ wvo B', 'zz-wvo-b');
    INSERT INTO auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
                            confirmation_token, recovery_token, email_change, email_change_token_new, created_at, updated_at)
    VALUES
        (u1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'zz-wvo-u1@example.invalid', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now()),
        (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
         'zz-wvo-u2@example.invalid', '{}'::jsonb, '{}'::jsonb, '', '', '', '', now(), now());

    -- CASE 1 — first save: the row, and exactly one audit event in the workspace_visibility domain.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', 'operations'], u1::text, 'operator', 'wvo-c1');
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 1 FAILED: first save reported changed=%', v_changed; END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1;
    IF v_keys IS DISTINCT FROM ARRAY['inbox', 'operations']::text[] THEN RAISE EXCEPTION 'CASE 1 FAILED: stored keys %', v_keys; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 1 FAILED: % events for the first save (want 1)', v_n; END IF;
    SELECT * INTO v_ev FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_ev.command_key IS DISTINCT FROM 'workspace_visibility.override_set' OR v_ev.domain IS DISTINCT FROM 'workspace_visibility'
       OR v_ev.subject_id IS DISTINCT FROM u1 OR v_ev.subject_type IS DISTINCT FROM 'workspace_visibility_override'
       OR v_ev.previous_state IS NOT NULL OR v_ev.new_state IS DISTINCT FROM 'inbox,operations'
       OR v_ev.operator_id IS DISTINCT FROM u1::text OR v_ev.origin IS DISTINCT FROM 'operator'
       OR v_ev.context_payload->>'presentation_only' IS DISTINCT FROM 'true'
       OR v_ev.context_payload->'before_hidden_surface_keys' IS DISTINCT FROM '[]'::jsonb
       OR v_ev.context_payload->'after_hidden_surface_keys' IS DISTINCT FROM '["inbox","operations"]'::jsonb
       OR v_ev.context_payload->>'correlation_id' IS DISTINCT FROM 'wvo-c1' THEN
        RAISE EXCEPTION 'CASE 1 FAILED: audit event shape %', row_to_json(v_ev);
    END IF;
    passed := passed + 1;

    -- CASE 2 — saving the same keys again is a truthful no-op: changed=false, no event.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', 'operations'], u1::text);
    IF v_changed IS DISTINCT FROM false THEN RAISE EXCEPTION 'CASE 2 FAILED: no-op save reported changed=%', v_changed; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 2 FAILED: no-op save wrote an event (% events)', v_n; END IF;
    passed := passed + 1;

    -- CASE 3 — a real change writes one more event, carrying the previous keys.
    SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], u1::text);
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 3 FAILED: change reported changed=%', v_changed; END IF;
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF v_n IS DISTINCT FROM 2 THEN RAISE EXCEPTION 'CASE 3 FAILED: % events after a change (want 2)', v_n; END IF;
    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility' AND previous_state = 'inbox,operations' AND new_state = 'inbox'
                  AND command_key = 'workspace_visibility.override_set') IS NOT TRUE THEN
        RAISE EXCEPTION 'CASE 3 FAILED: no event recording inbox,operations -> inbox';
    END IF;
    passed := passed + 1;

    -- CASE 4 — one row per (org, user): other principals are separate rows, and a write touches only its own.
    PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['tasks'], u2::text);
    PERFORM public.set_workspace_visibility_override(o2, u1, ARRAY['analytics'], u1::text);
    SELECT count(*) INTO v_n FROM public.workspace_visibility_overrides WHERE org_id IN (o1, o2);
    IF v_n IS DISTINCT FROM 3 THEN RAISE EXCEPTION 'CASE 4 FAILED: % rows for three principals', v_n; END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1;
    IF v_keys IS DISTINCT FROM ARRAY['inbox']::text[] THEN RAISE EXCEPTION 'CASE 4 FAILED: another principal''s save changed u1/o1 to %', v_keys; END IF;
    passed := passed + 1;

    -- CASE 5 — clear: row gone, one override_cleared event; clearing again is a no-op; other principals untouched.
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    SELECT changed INTO v_changed FROM public.clear_workspace_visibility_override(o1, u1, u1::text);
    IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 5 FAILED: clear reported changed=%', v_changed; END IF;
    IF EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: row survived clear';
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n + 1
       OR NOT EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility' AND subject_id = u1
                         AND command_key = 'workspace_visibility.override_cleared' AND domain = 'workspace_visibility'
                         AND previous_state = 'inbox' AND new_state = '' AND operator_id = u1::text) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clear did not write exactly one override_cleared event';
    END IF;
    SELECT changed INTO v_changed FROM public.clear_workspace_visibility_override(o1, u1, u1::text);
    IF v_changed IS DISTINCT FROM false THEN RAISE EXCEPTION 'CASE 5 FAILED: second clear reported changed=%', v_changed; END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n + 1 THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clearing an absent override wrote an event';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2)
       OR NOT EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o2 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 5 FAILED: clear removed another principal''s row';
    END IF;
    passed := passed + 1;

    -- CASE 6 — refused inputs change nothing (no row, no event). Control: CASE 1's valid call succeeded.
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY[]::text[], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: empty keys accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, NULL, u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null keys accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], NULL);
          RAISE EXCEPTION 'CASE 6 FAILED: null actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox'], '  ');
          RAISE EXCEPTION 'CASE 6 FAILED: blank actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.clear_workspace_visibility_override(o1, u2, NULL);
          RAISE EXCEPTION 'CASE 6 FAILED: clear without actor accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(NULL, u1, ARRAY['inbox'], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null org accepted';
    EXCEPTION WHEN null_value_not_allowed THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY[''], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: empty key string accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN PERFORM public.set_workspace_visibility_override(o1, u1, ARRAY['inbox', NULL], u1::text);
          RAISE EXCEPTION 'CASE 6 FAILED: null key element accepted';
    EXCEPTION WHEN check_violation THEN NULL; END;
    IF EXISTS (SELECT 1 FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u1) THEN
        RAISE EXCEPTION 'CASE 6 FAILED: a refused call left a row';
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n THEN
        RAISE EXCEPTION 'CASE 6 FAILED: a refused call wrote an event';
    END IF;
    passed := passed + 1;

    -- CASE 7 — API roles hold nothing: anon and authenticated (even as the row's own user) can neither read nor
    -- write the table nor call either function.
    PERFORM set_config('request.jwt.claims', json_build_object('sub', u2, 'role', 'authenticated')::text, true);
    BEGIN SET LOCAL ROLE authenticated; PERFORM count(*) FROM public.workspace_visibility_overrides WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated read its own row';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; INSERT INTO public.workspace_visibility_overrides (org_id, user_id, hidden_surface_keys, updated_by) VALUES (o2, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated inserted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; UPDATE public.workspace_visibility_overrides SET hidden_surface_keys = ARRAY['inbox'] WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated updated';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; DELETE FROM public.workspace_visibility_overrides WHERE user_id = u2;
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated deleted';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated called set';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE authenticated; PERFORM public.clear_workspace_visibility_override(o1, u2, u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: authenticated called clear';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM count(*) FROM public.workspace_visibility_overrides;
          RAISE EXCEPTION 'CASE 7 FAILED: anon read';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM public.set_workspace_visibility_override(o1, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: anon called set';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE anon; PERFORM public.clear_workspace_visibility_override(o1, u2, u2::text);
          RAISE EXCEPTION 'CASE 7 FAILED: anon called clear';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2;
    IF v_keys IS DISTINCT FROM ARRAY['tasks']::text[] THEN RAISE EXCEPTION 'CASE 7 FAILED: API-role attempts changed u2/o1 to %', v_keys; END IF;
    passed := passed + 1;

    -- CASE 8 — service_role reads (control), but cannot write the table directly (no audit bypass).
    BEGIN SET LOCAL ROLE service_role; SELECT count(*) INTO v_n FROM public.workspace_visibility_overrides WHERE org_id = o1;
          IF v_n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'CASE 8 FAILED: service_role read % rows for o1 (want 1)', v_n; END IF;
          RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'control ok';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; INSERT INTO public.workspace_visibility_overrides (org_id, user_id, hidden_surface_keys, updated_by) VALUES (o2, u2, ARRAY['inbox'], u2::text);
          RAISE EXCEPTION 'CASE 8 FAILED: service_role inserted directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; UPDATE public.workspace_visibility_overrides SET hidden_surface_keys = ARRAY['inbox'] WHERE org_id = o1;
          RAISE EXCEPTION 'CASE 8 FAILED: service_role updated directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; DELETE FROM public.workspace_visibility_overrides WHERE org_id = o1;
          RAISE EXCEPTION 'CASE 8 FAILED: service_role deleted directly';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN SET LOCAL ROLE service_role; SELECT changed INTO v_changed FROM public.set_workspace_visibility_override(o2, u2, ARRAY['inbox'], u2::text);
          IF v_changed IS DISTINCT FROM true THEN RAISE EXCEPTION 'CASE 8 FAILED: service_role set reported changed=%', v_changed; END IF;
          RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = 'control ok';
    EXCEPTION WHEN SQLSTATE 'P0099' THEN NULL; END;
    passed := passed + 1;

    -- CASE 9 — SCHEMA: the only references are the org and the auth user (nothing ties a row to a membership), RLS
    -- is on with no policy, and nothing in CASES 1-8 wrote an `access` event. CASE 10 proves retention by behaviour.
    SELECT array_agg(c.confrelid::regclass::text ORDER BY c.confrelid::regclass::text) INTO v_fks
      FROM pg_constraint c WHERE c.conrelid = 'public.workspace_visibility_overrides'::regclass AND c.contype = 'f';
    IF v_fks IS DISTINCT FROM ARRAY['auth.users', 'orgs']::text[] THEN RAISE EXCEPTION 'CASE 9 FAILED: foreign keys %', v_fks; END IF;
    IF (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.workspace_visibility_overrides'::regclass) IS NOT TRUE
       OR EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'workspace_visibility_overrides') THEN
        RAISE EXCEPTION 'CASE 9 FAILED: RLS off or a policy exists';
    END IF;
    IF EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id IN (o1, o2) AND (domain = 'access' OR command_key LIKE 'access.%')) THEN
        RAISE EXCEPTION 'CASE 9 FAILED: an access-domain event was written (Access History would read it)';
    END IF;
    passed := passed + 1;

    -- CASE 10 — BEHAVIOUR: a member who loses access through the real removal path keeps their preference.
    -- u2 is made a member of o1 (profile + a role with no grants — the money-capable trigger passes a grantless role;
    -- the profile-required constraint is deferred to a COMMIT this rollback-only run never reaches), then removed by
    -- public.remove_member_access_audited. Controls: the membership and profile are really gone and the removal wrote
    -- its own access.user.removed event — so a surviving override cannot pass because nothing was removed.
    INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope) VALUES (u2, o1, 'all', 'all');
    INSERT INTO public.user_roles (user_id, role, org_id) VALUES (u2, 'zz_wvo_member', o1);
    SELECT count(*) INTO v_n FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility';
    IF public.remove_member_access_audited(o1, u2, u1::text, 'operator', 'wvo-c10') IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'CASE 10 FAILED: removal did not remove exactly one role';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE org_id = o1 AND user_id = u2)
       OR EXISTS (SELECT 1 FROM public.user_access_profiles WHERE org_id = o1 AND user_id = u2) THEN
        RAISE EXCEPTION 'CASE 10 FAILED (control): membership or profile survived removal';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.mutation_events WHERE org_id = o1 AND subject_id = u2
                      AND command_key = 'access.user.removed' AND domain = 'access') THEN
        RAISE EXCEPTION 'CASE 10 FAILED (control): removal wrote no access.user.removed event';
    END IF;
    SELECT hidden_surface_keys INTO v_keys FROM public.workspace_visibility_overrides WHERE org_id = o1 AND user_id = u2;
    IF v_keys IS DISTINCT FROM ARRAY['tasks']::text[] THEN
        RAISE EXCEPTION 'CASE 10 FAILED: the preference did not survive loss of access (now %)', v_keys;
    END IF;
    IF (SELECT count(*) FROM public.mutation_events WHERE org_id = o1 AND domain = 'workspace_visibility') IS DISTINCT FROM v_n THEN
        RAISE EXCEPTION 'CASE 10 FAILED: removal wrote a workspace_visibility event';
    END IF;
    passed := passed + 1;

    RAISE NOTICE 'PASS access workspace visibility overrides: first save + one audit, no-op writes nothing, change carries previous keys, one row per principal, clear + idempotent clear, refused inputs inert, API roles hold nothing, service_role read-only on the table, schema references only org/auth user, retained through real access removal, own audit domain';
    RAISE NOTICE 'tests passed=% failed=0', passed;
END
$wvo$;

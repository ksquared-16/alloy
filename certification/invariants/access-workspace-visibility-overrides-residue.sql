-- Access V3 S5 — workspace visibility overrides: RESIDUE invariant (read-only; rollback-only runner).
--
-- For `database.run_rollback_invariant_test` against the SAME isolated certification environment, run AFTER each of the
-- pre-apply and post-apply invariants. It writes nothing. It proves that nothing those invariants did persisted —
-- including what the runner's own fingerprint does not name: the runner fingerprints the catalog, every sequence, the
-- migration ledger and only the tables a test NAMES as write targets, while the invariants also write through triggers
-- and functions:
--   * public.orgs AFTER INSERT seeds  -> role_definitions, role_permission_grants (orgs_seed_default_rbac,
--     orgs_seed_default_role_definitions) and document_types, document_type_versions (orgs_seed_document_configuration);
--     their permission_definitions inserts are the global catalog, ON CONFLICT (key) DO NOTHING, never per-org;
--   * set_/clear_workspace_visibility_override and remove_member_access_audited -> public.mutation_events (append-only)
--     and public.workspace_visibility_overrides;
--   * the direct seeds -> public.orgs, auth.users, public.user_roles, public.user_access_profiles.
-- The identifiers are the invariants' FIXED disposable ones; any row for them here is residue. The migration ledger is
-- not checked here (the runner fingerprints it; whether 20261222110000 is recorded depends on which step ran).

DO $residue$
DECLARE
    o1 constant uuid := 'a5a50000-5e00-4000-8000-0000000000a1';
    o2 constant uuid := 'a5a50000-5e00-4000-8000-0000000000a2';
    u1 constant uuid := 'a5a50000-5e00-4000-8000-0000000000b1';
    u2 constant uuid := 'a5a50000-5e00-4000-8000-0000000000b2';
    n_orgs integer; n_users integer; n_roles integer; n_profiles integer; n_role_defs integer; n_grants integer;
    n_doc_types integer; n_doc_type_versions integer; n_events integer; n_overrides integer := 0;
    total integer;
BEGIN
    SELECT count(*) INTO n_orgs FROM public.orgs WHERE id IN (o1, o2) OR slug IN ('zz-wvo-a', 'zz-wvo-b');
    SELECT count(*) INTO n_users FROM auth.users
     WHERE id IN (u1, u2) OR email IN ('zz-wvo-u1@example.invalid', 'zz-wvo-u2@example.invalid');
    SELECT count(*) INTO n_roles FROM public.user_roles WHERE org_id IN (o1, o2) OR user_id IN (u1, u2);
    SELECT count(*) INTO n_profiles FROM public.user_access_profiles WHERE org_id IN (o1, o2) OR user_id IN (u1, u2);
    SELECT count(*) INTO n_role_defs FROM public.role_definitions WHERE org_id IN (o1, o2);
    SELECT count(*) INTO n_grants FROM public.role_permission_grants WHERE org_id IN (o1, o2);
    SELECT count(*) INTO n_doc_types FROM public.document_types WHERE org_id IN (o1, o2);
    SELECT count(*) INTO n_doc_type_versions FROM public.document_type_versions WHERE org_id IN (o1, o2);
    SELECT count(*) INTO n_events FROM public.mutation_events WHERE org_id IN (o1, o2) OR subject_id IN (u1, u2);
    -- Absent before the migration is applied; read only when it exists (a statement is planned when reached).
    IF to_regclass('public.workspace_visibility_overrides') IS NOT NULL THEN
        SELECT count(*) INTO n_overrides FROM public.workspace_visibility_overrides WHERE org_id IN (o1, o2) OR user_id IN (u1, u2);
    END IF;

    total := n_orgs + n_users + n_roles + n_profiles + n_role_defs + n_grants + n_doc_types + n_doc_type_versions
             + n_events + n_overrides;
    IF total IS DISTINCT FROM 0 THEN
        RAISE EXCEPTION 'RESIDUE FOUND: orgs=% users=% user_roles=% user_access_profiles=% role_definitions=% role_permission_grants=% document_types=% document_type_versions=% mutation_events=% workspace_visibility_overrides=%',
            n_orgs, n_users, n_roles, n_profiles, n_role_defs, n_grants, n_doc_types, n_doc_type_versions, n_events, n_overrides;
    END IF;

    RAISE NOTICE 'PASS access workspace visibility residue: no row for the disposable identifiers in 10 tables (direct, trigger-seeded and audit)';
    RAISE NOTICE 'tests passed=% failed=0', 1;
END
$residue$;

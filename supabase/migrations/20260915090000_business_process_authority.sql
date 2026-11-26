-- BUSINESS PROCESS AUTHORITY — and the retirement of a product that was never there.
--
-- Eight handlers under /api/admin/departments authorized on the literal `admin` role key. The
-- Department convergence census (gar_4801886a81e716, gar_04da3f449e8ea4) then proved that not one
-- of them is a department operation:
--
--   * Every mounted caller of lifecycle-builder (13), lifecycle-activation (3),
--     lifecycle-requirements (2) and lifecycle-actions-matrix (2) is a Lifecycle or Business Process
--     surface. There is no department-administration caller anywhere in the mounted tree.
--   * The generic POST is reached by `createLifecycleViaBuilderPath`, which provisions the runtime
--     identity of a NEW Business Process. The operator types a process name, not a department name.
--   * On the deployed primary, four of five department rows carry no lifecycle marker and have not
--     been written since the day they were provisioned; the fifth is builder-owned and accounts for
--     all 31 business_process_revisions and the only recent write.
--
-- So the authority belongs to Business Process. Creating `departments.manage` would have given a
-- retired product abstraction a capability vocabulary and made it look current again.
--
-- ── THE TWO KEYS, AND WHY ACTIVATION IS NOT CONFIGURATION ──
--
--   business_process.configure   designing the process — builder edits, stage requirements, the
--                                actions matrix, publishing configuration, and provisioning the
--                                runtime identity a new process needs. Changes what a process WOULD do.
--   business_process.activate    changing which configuration is live, and tearing an activated
--                                lifecycle down. Changes what the tenant IS RUNNING.
--
-- Neither implies the other, for the same reason `layouts.lifecycle` is not inside `layouts.manage`:
-- a role can be trusted to design a process without being trusted to switch the tenant onto it.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT CREATE ──
--
-- No `departments.manage`, `departments.delete` or `departments.activate`. The department row
-- survives as ACL and metadata ownership — `docs/platform/core/entity-model.md` has said so all
-- along — and internal grouping identity does not get an operator-facing capability.
--
-- No key for `PATCH /api/admin/departments/[departmentId]` when it carries `metadata`. Its one live
-- metadata caller is the org-wide attention/SLA page, whose rules drive `resolveOpportunityAttention`
-- and are filed under `crm_attention` in the runtime metadata catalog. That is not a Business
-- Process write. The only existing key that could own it, `settings.manage`, is held by admin AND
-- ops while the route it would replace is admin-only, so reusing it would widen access. Gating it
-- under `business_process.configure` would turn a process-design key into a generic JSON write key.
-- That shape keeps its role gate as ATTENTION_SLA_METADATA_AUTHORITY_DEBT until its owner exists.
--
-- No read key. Every gate converged here sits inside a mutation handler; the GETs are untouched.

DO $guard$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'BPAUTH ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'BPAUTH ABORT: public.role_permission_grants is absent.';
    END IF;
    IF to_regclass('public.departments') IS NULL THEN
        RAISE EXCEPTION 'BPAUTH ABORT: public.departments is absent — this slice keeps the grouping identity, it does not remove it.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE CAPABILITIES. `configure` and `activate` are both words the permission grid does not read
--    as a View/Manage verb, so each becomes its own row in the role editor. That is wanted:
--    activating a process must never arrive as a side effect of granting someone design rights.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('business_process.configure', 'business_process', 'Configure business processes',
     'Design a business process: builder edits, stage requirements, the actions matrix, publishing configuration, and provisioning the runtime identity a new process needs.', true),
    ('business_process.activate', 'business_process', 'Activate business processes',
     'Change which business process configuration is live, and tear an activated lifecycle down. Separate from configuring one, and never implied by it.', true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPATIBILITY. Every converged operation was admin-only the moment before this migration, so
--    both keys go to `admin` and to nobody else. `ops` has never been able to edit a lifecycle
--    builder or activate a process, and does not start now.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key IN ('business_process.configure', 'business_process.activate')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own compatibility claim before it lands.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_cat         bigint;
    v_admin_short bigint;
    v_ops_new     bigint;
    v_director    bigint;
    v_dept_keys   bigint;
BEGIN
    SELECT count(*) INTO v_cat FROM public.permission_definitions
     WHERE key IN ('business_process.configure', 'business_process.activate') AND is_active;
    IF v_cat <> 2 THEN
        RAISE EXCEPTION 'BPAUTH SELF-TEST: expected 2 new active keys, found %.', v_cat;
    END IF;

    -- No `departments.*` capability may exist. The whole point of this slice is that the department
    -- product is retired; a key named for it would undo that in vocabulary.
    SELECT count(*) INTO v_dept_keys FROM public.permission_definitions
     WHERE key LIKE 'departments.%';
    IF v_dept_keys <> 0 THEN
        RAISE EXCEPTION 'BPAUTH SELF-TEST: % departments.* capability key(s) exist; the retired product must not gain capability vocabulary.', v_dept_keys;
    END IF;

    -- Every active admin role holds both keys it is now authorized by. A migration that enforces a
    -- key without confirming the grant is how an administrator gets locked out of their own builder.
    SELECT count(*) INTO v_admin_short
      FROM public.role_definitions rd
     WHERE rd.role_key = 'admin' AND rd.is_active
       AND (SELECT count(DISTINCT g.permission_key) FROM public.role_permission_grants g
             WHERE g.org_id = rd.org_id AND g.role_key = 'admin' AND g.allowed
               AND g.permission_key IN ('business_process.configure', 'business_process.activate')) <> 2;
    IF v_admin_short <> 0 THEN
        RAISE EXCEPTION 'BPAUTH SELF-TEST: % admin role(s) would be locked out of business process configuration they can reach today.', v_admin_short;
    END IF;

    -- ops receives neither key. It has never had either operation.
    SELECT count(*) INTO v_ops_new FROM public.role_permission_grants
     WHERE role_key = 'ops' AND permission_key IN ('business_process.configure', 'business_process.activate');
    IF v_ops_new <> 0 THEN
        RAISE EXCEPTION 'BPAUTH SELF-TEST: ops received % business process key(s) it has never held.', v_ops_new;
    END IF;

    SELECT count(*) INTO v_director FROM public.role_permission_grants
     WHERE role_key IN ('school_director', 'regional_lead')
       AND permission_key IN ('business_process.configure', 'business_process.activate');
    IF v_director <> 0 THEN
        RAISE EXCEPTION 'BPAUTH SELF-TEST: director roles received % key(s) they never had.', v_director;
    END IF;

    RAISE NOTICE 'BPAUTH: two business process keys catalogued, admin authorized for both, ops and directors unchanged, no departments.* key created.';
END
$selftest$;

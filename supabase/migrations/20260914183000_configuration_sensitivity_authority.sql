-- CONFIGURATION AUTHORITY, SPLIT BY SENSITIVITY — AND TWO PATHS THAT DISAGREED.
--
-- Seventeen handlers under option-sets/, entity-layouts/ and field-definitions/ authorized on the
-- literal `admin` role key. Meanwhile THREE capabilities describing those same domains —
-- `option_sets.manage`, `layouts.manage`, `fields.manage` — were already catalogued, already
-- granted to admin AND ops, and already ENFORCED through Config Layout Assist.
--
-- So the product gave two different answers about the same configuration. Through the assisted path
-- an ops user could change a layout; through the direct route the same person was refused. The
-- defect was never a missing capability — it was a route asking what someone is CALLED while the
-- canonical path asked what they can DO.
--
-- ── WHY NOT JUST ENFORCE THE THREE EXISTING KEYS EVERYWHERE ──
--
-- Because the assisted path cannot do most of this. Its thirteen operation kinds contain NO delete
-- of any kind, and no layout version lifecycle at all: `layouts.manage` there governs putting a
-- field on a layout and reordering a section. Seven routes have a genuine assisted equivalent, so
-- converging those is compatibility alignment and `ops` rightly gains direct access to effects it
-- could already produce. The other operations have no equivalent, and flattening them into the
-- manage keys would have handed `ops` deletion and publishing it has never had — a silent expansion
-- wearing a cleanup's clothes.
--
-- ── THE THREE NEW KEYS, AND WHY EACH IS ITS OWN ──
--
--   option_sets.delete   removing a set or one of its items.
--   layouts.lifecycle    creating, duplicating, publishing and rolling back a layout. A version
--                        state machine is not "editing inside a layout"; folding it into
--                        `layouts.manage` would let an operator publish by being granted edit.
--   fields.delete        removing a field definition.
--
-- None is implied by its manage key. Every one defaults to `admin` only, which is exactly what the
-- role gate admitted the moment before this migration.
--
-- ── WHAT THIS MIGRATION DELIBERATELY DOES NOT CREATE ──
--
-- No `layouts.delete`. `entity-layouts/[id]` DELETE is a MODEL_CONTRACT_DEFECT: that file's own
-- header says published rows are immutable and to publish a new version instead, yet the handler
-- deletes published rows and busts the `fps:` config read when it does. Giving a contradiction a
-- capability would make it look sanctioned. It keeps its role gate — no more reachable than before.
--
-- No platform-field key. `ensure-platform-field` installs `is_system: true` rows the organization
-- can then never delete (DELETE refuses them) nor re-identify (PATCH freezes their identity). Whether
-- that one-way platform authority may be delegated to an arbitrary custom role is a product decision
-- with no doctrine behind it, and the instruction that authorized this work says not to guess.
--
-- No read keys. Every gate here sits inside a mutation handler; the GETs are untouched.

DO $guard$
BEGIN
    IF to_regclass('public.permission_definitions') IS NULL THEN
        RAISE EXCEPTION 'CONFIGAUTH ABORT: public.permission_definitions is absent.';
    END IF;
    IF to_regclass('public.role_permission_grants') IS NULL THEN
        RAISE EXCEPTION 'CONFIGAUTH ABORT: public.role_permission_grants is absent.';
    END IF;
END
$guard$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE CAPABILITIES. Each final segment is a word the permission grid does not read as a
--    read/write verb, so each becomes its OWN row in the role editor rather than folding into a
--    View/Manage radio. That is wanted: deleting an option set must never arrive as a side effect
--    of granting someone Manage.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.permission_definitions (key, group_key, label, description, is_active)
VALUES
    ('option_sets.delete', 'option_sets', 'Delete option sets',
     'Delete an option set or one of its items. Separate from managing them, and never implied by it.', true),
    ('layouts.lifecycle', 'layouts', 'Manage layout lifecycle',
     'Create, duplicate, publish and roll back layout versions. Distinct from editing inside an existing layout.', true),
    ('fields.delete', 'fields', 'Delete fields',
     'Delete a field definition. Separate from managing field configuration, and never implied by it.', true)
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COMPATIBILITY. All six operations were admin-only a moment ago, so the three keys go to
--    `admin` and to nobody else. `ops` keeps the manage keys it already held — the convergence is
--    in the routes, not in anyone's package — and receives none of these.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key IN ('option_sets.delete', 'layouts.lifecycle', 'fields.delete')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- Admin must also actually hold the three EXISTING keys it is about to be authorized by on the
-- converged routes. They have been seeded for months, but a migration that enforces a key without
-- confirming the grant is how an administrator gets locked out of their own configuration.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions rd
JOIN public.permission_definitions pd
  ON pd.key IN ('option_sets.manage', 'layouts.manage', 'fields.manage')
WHERE rd.role_key = 'admin'
ON CONFLICT (org_id, role_key, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- SELF-TEST — the migration proves its own compatibility claim before it lands.
-- ─────────────────────────────────────────────────────────────────────────────
DO $selftest$
DECLARE
    v_cat        bigint;
    v_admin_short bigint;
    v_ops_new    bigint;
    v_ops_manage bigint;
    v_director   bigint;
BEGIN
    SELECT count(*) INTO v_cat FROM public.permission_definitions
     WHERE key IN ('option_sets.delete', 'layouts.lifecycle', 'fields.delete') AND is_active;
    IF v_cat <> 3 THEN
        RAISE EXCEPTION 'CONFIGAUTH SELF-TEST: expected 3 new active keys, found %.', v_cat;
    END IF;

    -- Every active admin role holds all six keys it is now authorized by.
    SELECT count(*) INTO v_admin_short
      FROM public.role_definitions rd
     WHERE rd.role_key = 'admin' AND rd.is_active
       AND (SELECT count(DISTINCT g.permission_key) FROM public.role_permission_grants g
             WHERE g.org_id = rd.org_id AND g.role_key = 'admin' AND g.allowed
               AND g.permission_key IN ('option_sets.manage', 'option_sets.delete',
                                        'layouts.manage', 'layouts.lifecycle',
                                        'fields.manage', 'fields.delete')) <> 6;
    IF v_admin_short <> 0 THEN
        RAISE EXCEPTION 'CONFIGAUTH SELF-TEST: % admin role(s) would be locked out of configuration they can reach today.', v_admin_short;
    END IF;

    -- ops receives none of the three sensitive keys. It has never had any of these operations.
    SELECT count(*) INTO v_ops_new FROM public.role_permission_grants
     WHERE role_key = 'ops' AND permission_key IN ('option_sets.delete', 'layouts.lifecycle', 'fields.delete');
    IF v_ops_new <> 0 THEN
        RAISE EXCEPTION 'CONFIGAUTH SELF-TEST: ops received % sensitive configuration key(s) it has never held.', v_ops_new;
    END IF;

    -- And the manage keys ops ALREADY held are untouched: the convergence is in the routes, not in
    -- anyone's package. Silently dropping them here would break Config Layout Assist for ops.
    SELECT count(*) INTO v_ops_manage
      FROM public.role_definitions rd
     WHERE rd.role_key = 'ops' AND rd.is_active
       AND (SELECT count(DISTINCT g.permission_key) FROM public.role_permission_grants g
             WHERE g.org_id = rd.org_id AND g.role_key = 'ops' AND g.allowed
               AND g.permission_key IN ('option_sets.manage', 'layouts.manage', 'fields.manage')) <> 3;
    IF v_ops_manage <> 0 THEN
        RAISE EXCEPTION 'CONFIGAUTH SELF-TEST: % ops role(s) lost a manage key they already exercised through Config Layout Assist.', v_ops_manage;
    END IF;

    SELECT count(*) INTO v_director FROM public.role_permission_grants
     WHERE role_key IN ('school_director', 'regional_lead')
       AND permission_key IN ('option_sets.delete', 'layouts.lifecycle', 'fields.delete');
    IF v_director <> 0 THEN
        RAISE EXCEPTION 'CONFIGAUTH SELF-TEST: director roles received % key(s) they never had.', v_director;
    END IF;

    RAISE NOTICE 'CONFIGAUTH: three sensitive keys catalogued, admin authorized for all six, ops keeps its manage keys and gains no deletion or lifecycle.';
END
$selftest$;

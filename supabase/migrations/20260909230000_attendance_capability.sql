-- =============================================================================
-- Attendance capability — a named permission for capturing attendance
-- =============================================================================
-- Slice 2A. Attendance had no capability of its own: reaching the route was the
-- authorization. This registers `attendance.record` and `attendance.read` in the
-- canonical RBAC catalog so the authority can be granted, revoked and audited
-- like every other one — no Attendance-specific RBAC.
--
-- ── WHY BOTH ROLES GET IT BY DEFAULT ──
--
-- `operational_expectations.author` granted to `admin` only, because it was a NEW
-- capability nobody had. Attendance capture is not new: `admin` and `ops` both
-- perform it today, and both already hold `ops.schedules.write`. Granting admin
-- only would revoke a daily operational ability from every existing ops user
-- under the banner of a security fix. The point of this slice is that the
-- authority becomes NAMED and SCOPED, not that it becomes scarcer.
--
-- Site scope is enforced separately and independently, in
-- `attendancePermissions.ts` — a permission says WHAT you may do, never WHERE.
--
-- Additive + idempotent. No existing grant is altered or dropped.
-- =============================================================================

-- 1. Catalog registration.
--    The RBAC catalog is spread across up to three tables and NOT every
--    environment has all three (`permissions` / `permission_keys` are absent in
--    some, `permission_definitions` is the one constant). Registering only where
--    the table exists keeps this migration replayable everywhere instead of
--    failing on the first environment that never grew the optional catalogs.
DO $$
DECLARE
    v_key text;
    v_label text;
    v_desc text;
BEGIN
    FOR v_key, v_label, v_desc IN
        SELECT * FROM (VALUES
            ('attendance.record', 'Record child attendance',
             'Author attendance facts (check-in, check-out, movement, absence) and their corrections through the one governed capture path. Site scope is enforced independently: this grants the capability, never the reach.'),
            ('attendance.read', 'View child attendance',
             'Read attendance facts and the read models derived from them, narrowed to the sites the caller holds.')
        ) AS v(k, l, d)
    LOOP
        IF to_regclass('public.permissions') IS NOT NULL THEN
            EXECUTE 'INSERT INTO public.permissions (key, group_key, label, is_active)
                     VALUES ($1, ''operations'', $2, true)
                     ON CONFLICT (key) DO UPDATE SET
                        group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active'
            USING v_key, v_label;
        END IF;

        IF to_regclass('public.permission_keys') IS NOT NULL THEN
            EXECUTE 'INSERT INTO public.permission_keys (key, label, group_key, description, is_active)
                     VALUES ($1, $2, ''operations'', $3, true)
                     ON CONFLICT (key) DO UPDATE SET
                        label = EXCLUDED.label, group_key = EXCLUDED.group_key,
                        description = EXCLUDED.description, is_active = EXCLUDED.is_active'
            USING v_key, v_label, v_desc;
        END IF;

        IF to_regclass('public.permission_definitions') IS NOT NULL THEN
            EXECUTE 'INSERT INTO public.permission_definitions (key, group_key, label, is_active)
                     VALUES ($1, ''operations'', $2, true)
                     ON CONFLICT (key) DO UPDATE SET
                        group_key = EXCLUDED.group_key, label = EXCLUDED.label, is_active = EXCLUDED.is_active'
            USING v_key, v_label;
        END IF;
    END LOOP;
END$$;

-- 2. Default grants preserving today's effective ability: admin + ops, per org.
--    Idempotent per (org, role, permission) so re-running disturbs nothing.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT o.id, r.role_key, p.permission_key, true
FROM public.orgs AS o
CROSS JOIN (VALUES ('admin'), ('ops')) AS r(role_key)
CROSS JOIN (VALUES ('attendance.record'), ('attendance.read')) AS p(permission_key)
WHERE NOT EXISTS (
    SELECT 1 FROM public.role_permission_grants AS g
    WHERE g.org_id = o.id
      AND g.role_key = r.role_key
      AND g.permission_key = p.permission_key
);

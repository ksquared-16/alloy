-- =============================================================================
-- D-H6 — the Health visibility boundary.
--
-- Admin/ops ROUTE access is not authorization for structured health data. Before this, an operator
-- who could open a child's Focus Panel could see anything the panel composed, and the platform had
-- no way to say "this person may see attendance and not medical conditions": the permission
-- catalogue held 57 keys and none was health, while Surface field policies
-- (editable | read-only | hidden) are PRESENTATION configuration, uniform across roles.
--
-- Two keys, deliberately — not a medical-role subsystem:
--
--   health.view     read structured health facts and health documents
--   health.manage   assert, correct or end them
--
-- ── GRANTED TO ADMIN ONLY, ON PURPOSE ──
--
-- `ops` is NOT granted by default. That is the entire point of the decision: an operator who already
-- works Attendance or Financials must not acquire allergies, conditions and medications merely
-- because a Health card was placed on a Surface. An org that wants ops to hold it grants it
-- explicitly, which is a decision someone made rather than a default nobody noticed.
-- =============================================================================

INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('health.view', 'health', 'View health information',
     'Read structured health facts (allergies, conditions, medications, immunizations) and health documents.'),
    ('health.manage', 'health', 'Manage health information',
     'Assert, correct or end structured health facts. Implies no read grant of its own.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

-- Grant to the `admin` role of every org that has one. `ops` is intentionally omitted.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pk.key, true
  FROM public.role_definitions rd
  CROSS JOIN (VALUES ('health.view'), ('health.manage')) AS pk(key)
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = pk.key
   );

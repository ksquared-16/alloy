-- =============================================================================
-- A SCHOOL DIRECTOR COULD NOT SEE THE MONEY FOR THEIR OWN SCHOOL.
--
-- THE SYMPTOM. A normal operator opening Financials was told "Viewing financial work requires
-- fin.read" and shown an empty workspace. The grant was not missing for the reason that reads
-- first: `fin.read` exists, it is granted, and the resolution path
-- (`user_roles` -> `role_permission_grants` via `resolveActorPermissionGrants`) is correct.
--
-- THE CAUSE. The default RBAC seed (`w12_seed_default_rbac_enumerated_grants`) enumerates grants
-- for exactly two roles, `admin` and `ops`. Four system roles are DEFINED —
-- `admin`, `ops`, `regional_lead`, `school_director` — and the other two were seeded with no
-- grants of any kind. Not a narrow financial omission: `school_director` and `regional_lead`
-- carried an empty permission set across every domain. Financials is simply the surface where a
-- role holding nothing became visible, because it is the one that says so out loud instead of
-- rendering an empty list.
--
-- WHAT THIS MIGRATION DOES, AND DELIBERATELY DOES NOT DO.
--
-- It grants `fin.read` — and only `fin.read` — to `school_director` and `regional_lead`. Reading
-- the financial position of the school you run is squarely inside those roles' remit, and it is
-- the minimum that makes the workspace truthful for them.
--
-- It does NOT grant `fin.write`, `fin.adjust`, `fin.responsibility` or `fin.subsidy`. Those are
-- mutation authority — billing a family, forgiving what is owed, deciding which parent carries
-- seventy percent, settling agency money — and widening them is a decision about who may move
-- money, not a repair to a workspace that could not render. A read repair must not smuggle write
-- authority in behind it.
--
-- It also does not attempt to populate the other ~60 permissions those two roles are missing.
-- That backlog spans domains this migration has no standing to speak for, and inventing authority
-- across them to fix a Financials symptom would be the same mistake in the opposite direction. It
-- is recorded as a finding for the Access/RBAC owner instead.
--
-- Idempotent, org-scoped, and applied only to roles that actually exist and are active in each
-- org — so an org that has removed or renamed these roles is untouched.
-- =============================================================================

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'fin.read', true
  FROM public.role_definitions rd
 WHERE rd.role_key IN ('school_director', 'regional_lead')
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = 'fin.read'
   );

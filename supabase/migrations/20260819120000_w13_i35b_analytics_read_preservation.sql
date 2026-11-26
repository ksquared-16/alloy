-- W-13 / `I-35`ᴮ / `A2-8` — the grant that lets analytics stop being authorized by admission.
--
-- `I-35`ᴮ is `W-13`'s exit clause: **an admission predicate MUST NOT satisfy a capability gate.**
-- `04…:752` states the cost of half-answering it — *"the fifth layer survives under a new name."*
--
-- `W-13` removed the two sites where `portalEligible` conferred authority in the Users & Roles gate.
-- It did not remove the third, and that one is still live:
--
--     canReadAnalytics.ts:32   if (subject.portalEligible) return true;
--
-- Every other `portalEligible` reader in the tree DENIES on it — `if (!portalEligible) → 403` — which
-- `I-35`ᴮ permits, because admission may refuse. This one AUTHORIZES, which is exactly what it
-- forbids. The module's own comment has said so since it was written: *"The `portalEligible` leg is
-- what W-13 replaces with a `portal.access` capability."*
--
-- **Why this migration exists, and why the code change must not ship without it.** `portalEligible`
-- is `admin` OR `ops`. `reports.read` is currently granted to `admin` ONLY. Deleting the leg without
-- this grant would silently remove analytics from every `ops` operator who has it today — an
-- unannounced narrowing, which is the mistake `W-8` is this initiative's own record of. So the grant
-- lands first and the code follows, exactly as `20260818170000` did for the Users & Roles gate.
--
-- **The read key, and only the read key.** `canReadAnalytics` gates READS; `requireAnalyticsReadAccess`
-- is its only consumer. Granting `ops` `reports.write` would preserve nothing and hand it a mutation
-- capability it does not have today. `W-13`'s own words: *"A preservation migration that widens is
-- not a preservation migration."*
--
-- **New orgs are already correct.** `seed_default_rbac` (`20260807170000`) enumerates `reports.read`
-- for `ops`. This covers orgs that already existed, and it re-asserts rather than assumes, because
-- nothing has been keeping that row true for orgs created before the seed was enumerated.
--
-- Additive and idempotent. Changes no one's effective access: every principal this grants already
-- reads analytics through the admission leg the code change then removes.

-- The key is validated against the CANONICAL catalog, not merely spelled. `role_permission_grants`
-- is FK'd to `permission_definitions` (Phase 0, ON DELETE RESTRICT), so a bad key would fail the
-- insert — but failing with a constraint error is not the same as refusing to grant a capability
-- that does not exist. RL-7 requires every writer to validate against the table the FK names, and it
-- is right to: the join makes this migration a no-op on an environment where the key is absent or
-- deactivated, instead of an abort.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, pd.key, true
FROM public.role_definitions AS rd
JOIN public.permission_definitions AS pd
  ON pd.key = 'reports.read'
 AND pd.is_active
WHERE rd.role_key = 'ops'
ON CONFLICT (org_id, role_key, permission_key) DO UPDATE
SET allowed = true;

-- Fail closed: after this runs, every org that defines `ops` must be able to satisfy the analytics
-- read gate by CAPABILITY, because the next commit stops satisfying it by admission. An org missed
-- here would lose analytics for its ops operators the moment the code lands.
DO $verify$
DECLARE
    uncovered bigint;
BEGIN
    SELECT count(*) INTO uncovered
    FROM public.role_definitions rd
    WHERE rd.role_key = 'ops'
      AND NOT EXISTS (
          SELECT 1 FROM public.role_permission_grants g
          WHERE g.org_id = rd.org_id
            AND g.role_key = 'ops'
            AND g.permission_key = 'reports.read'
            AND g.allowed
      );

    IF uncovered > 0 THEN
        RAISE EXCEPTION
            'W-13/I-35B aborted: % org(s) define ops without reports.read. Removing the portalEligible leg would narrow their analytics access.',
            uncovered;
    END IF;
END
$verify$;

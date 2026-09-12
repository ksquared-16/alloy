-- =============================================================================
-- THE ADMINISTRATOR COULD MUTATE MONEY IT WAS NOT ALLOWED TO LOOK AT.
--
-- THE SYMPTOM. The managed QA identity — `admin` in its org, department scope all, site scope all,
-- authenticated — opens Financials and is refused:
--
--     403  required_permission = fin.read
--
-- while the same role holds `fin.adjust`, `fin.responsibility` and `fin.subsidy`. Billing a family,
-- forgiving what is owed and settling agency money were all permitted; reading the resulting balance
-- was not. That is not a narrow inconvenience — it is an incoherent authority boundary, and it is the
-- shape a reviewer should distrust: mutation without the read that governs it.
--
-- WHY THE EXISTING REPAIRS DID NOT REACH IT.
--
-- `20260910183000_access_v2_default_role_package_completeness` fixed this for NEW organizations: the
-- seeded admin package names `fin.read` outright. For EXISTING organizations it backfilled only the
-- nine keys catalogued after W-12 froze the enumeration, on an exact discriminator — a key catalogued
-- after an org was seeded means that key's own one-shot backfill already reached it, so an absence is
-- somebody's decision and must be left alone.
--
-- `fin.read` was excluded from that list for a stated reason: every org "WAS seeded with it and an
-- absence is therefore a revocation". This organization falsifies that premise. Measured against the
-- seed's own enumeration, its `admin` is missing TWENTY-TWO keys, including all four `admin.*`
-- (roles/users read and write) and all twelve `ops.*`. Nobody revokes `admin.users.read` and the
-- entire `ops.*` family from the Organization Administrator as a policy decision. This org never met
-- the W-12 baseline at all, so for it "no row" is an absence, not a revocation.
--
-- WHY GRANTING IT TO `admin` IS SAFE TO DO UNCONDITIONALLY.
--
-- The seed states the contract in its own words: Organization Administrator receives "every ordinary
-- organizational capability the platform defines, with no deliberate platform-owner exclusion — the
-- only role in the vocabulary for which that is the intended answer." For `admin`, therefore, a
-- missing ordinary capability cannot be a legitimate revocation; the role's contract does not admit
-- one. That is what makes this safe for `admin` and would NOT make it safe for any other role.
--
-- WHAT THIS DELIBERATELY DOES NOT DO.
--
-- It grants `fin.read` and nothing else. It does not grant `fin.write` — read is what the refused
-- surface requires, and widening mutation authority is a decision about who may move money, not a
-- repair to a workspace that could not render. It does not restore the other twenty-one missing keys:
-- that backlog spans domains this migration has no standing to speak for, and is recorded for the
-- Access/RBAC owner. It touches no other role, and it does not weaken
-- `assertFinancialsReadAllowed` — server-side enforcement is unchanged and still the only gate.
--
-- Idempotent, org-scoped, and applied only where the role actually exists and is active.
-- =============================================================================

-- Validated against `permission_definitions`, the table the grants FK actually names (RL-7). The
-- director repair this mirrors omitted that join and is the standing offender the catalog lock
-- reports; writing a second one would make the lock fail twice for the same reason.
INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, 'admin', pd.key, true
  FROM public.role_definitions rd
  JOIN public.permission_definitions pd
    ON pd.key = 'fin.read'
   AND pd.is_active
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = 'admin'
          AND g.permission_key = pd.key
   );

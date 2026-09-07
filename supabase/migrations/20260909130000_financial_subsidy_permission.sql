-- =============================================================================
-- ADMINISTERING SUBSIDY IS ITS OWN AUTHORITY.
--
-- Financials already separates three acts: `fin.write` bills what was authored, `fin.adjust`
-- forgives what is owed, `fin.responsibility` decides who owes it. Subsidy administration is a
-- fourth and is not a shade of any of them — recording an authorization, submitting a claim and
-- reconciling a remittance change what the provider EXPECTS FROM AN AGENCY and, under the approved
-- collection policy, what a family is asked to pay this month. None of that is billing, forgiving
-- or reassigning.
--
-- Granted to `admin` by default, like the other three. An org may grant it more widely — a billing
-- clerk who submits claims plausibly needs it and plausibly should not hold `fin.adjust`.
-- =============================================================================

INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('fin.subsidy', 'financials', 'Administer subsidy funding',
     'Record agency authorizations, submit claims, reconcile remittances and resolve subsidy '
     || 'variance. Does not move money — agency cash still enters through the payment path — and '
     || 'never reduces what a family contractually owes.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'fin.subsidy', true
  FROM public.role_definitions rd
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id AND g.role_key = rd.role_key AND g.permission_key = 'fin.subsidy'
   );

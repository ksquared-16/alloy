-- =============================================================================
-- DECIDING WHO OWES IS A THIRD AUTHORITY, NOT A SHADE OF THE OTHER TWO.
--
-- `fin.write` bills what was authored — a template, an accepted term, a receipt. `fin.adjust`
-- forgives what is owed. Neither describes what this permission governs: moving CONTRACTUAL
-- position between two real people, where the total owed does not change at all and the answer to
-- "who owes it" does.
--
-- That is materially distinct, and folding it into either would mean anyone who can bill a family
-- can also decide which parent carries seventy percent of it, with nothing in the grant record to
-- tell the two acts apart. Granted to `admin` by default, like `fin.adjust` and
-- `enrollment.pricing.override`; an org may grant it more widely.
--
-- It is deliberately an OPERATOR permission. Separated/co-parent visibility policy is undecided
-- (Director decision 3), so nothing here grants a parent sight of another parent's position.
-- =============================================================================

INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('fin.responsibility', 'financials', 'Configure who is responsible',
     'Record and supersede which named parties contractually bear a family''s obligations, and the '
     || 'expected funding attached to their shares. Does not change what is owed — only who owes it.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'fin.responsibility', true
  FROM public.role_definitions rd
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = 'fin.responsibility'
   );

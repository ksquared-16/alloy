-- =============================================================================
-- MOVING MONEY BY HAND IS A DIFFERENT PERMISSION FROM BILLING A FAMILY.
--
-- `fin.write` is the permission to run the machine: generate a month's tuition, add a configured
-- charge, post it, record a payment. Every one of those amounts comes from something authored — a
-- template, an accepted term, a receipt — and the operator is agreeing with it rather than deciding
-- it.
--
-- A manual credit, a waiver or a write-off is not that. The operator names the amount, and the
-- family owes less because a person said so. Gating that behind the same grant as ordinary billing
-- means everyone who can bill can also forgive, and nothing in the record distinguishes them.
--
-- Granted to `admin` by default, like `enrollment.pricing.override`: the decision to reduce what a
-- family owes belongs with someone who answers for it. An org may grant it more widely.
--
-- The reason a reduction exists is separately enforced by the service and the table's CHECK — a
-- permission says WHO may, never WHY.
-- =============================================================================

INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('fin.adjust', 'financials', 'Adjust an account by hand',
     'Create a manual credit, waiver, write-off or correction that reduces what a family owes, with '
     || 'a recorded reason. Distinct from fin.write, which bills what was already authored.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'fin.adjust', true
  FROM public.role_definitions rd
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = 'fin.adjust'
   );

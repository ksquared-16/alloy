-- =============================================================================
-- OVERRIDING RECOMMENDED TUITION IS A PERMISSION, NOT A BUTTON.
--
-- Accepting the recommendation is ordinary operational work: the price came from the catalog, the
-- resolver chose it, and the operator agreed. Choosing a DIFFERENT authored option is an exception,
-- and an exception nobody is accountable for is just an editable price with extra steps.
--
-- So the override path is gated by a real grant, checked server-side against the actor's own
-- memberships — never against anything a payload claims. A UI that renders the control to someone
-- without the grant is a cosmetic mistake; the write still fails.
--
-- Granted to `admin` by default, exactly as `enrollment.requirement_exception.manage` is: the
-- decision to price a family differently belongs with someone who answers for it. An org may grant
-- it more widely through role configuration.
-- =============================================================================

INSERT INTO public.permission_definitions (key, group_key, label, description)
VALUES
    ('enrollment.pricing.override', 'enrollment', 'Override recommended tuition',
     'Choose a different authored tuition option than the one Commercial Execution recommends for an '
     || 'assignment, with a recorded reason. Never permits an amount that is not in the catalog.')
ON CONFLICT (key) DO UPDATE
    SET group_key = EXCLUDED.group_key,
        label = EXCLUDED.label,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now();

INSERT INTO public.role_permission_grants (org_id, role_key, permission_key, allowed)
SELECT rd.org_id, rd.role_key, 'enrollment.pricing.override', true
  FROM public.role_definitions rd
 WHERE rd.role_key = 'admin'
   AND rd.is_active
   AND NOT EXISTS (
       SELECT 1 FROM public.role_permission_grants g
        WHERE g.org_id = rd.org_id
          AND g.role_key = rd.role_key
          AND g.permission_key = 'enrollment.pricing.override'
   );

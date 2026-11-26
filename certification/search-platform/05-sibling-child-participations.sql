-- =============================================================================
-- Two siblings, one case, two different child stages.
--
-- The membership contract's sharpest claim is that a shared host does NOT collapse two
-- children onto one answer. Proving it needs exactly this shape and nothing else: one
-- household, one case, two children, two stages.
--
-- The tenant already ships a household with two members and a case; this authors only the
-- missing PARTICIPATIONS. No stage semantics, no primary actions, no new Work Views.
--
--   sibling A  → waitlist    ⇒ waitlist_children + priority_children + all_children  (3)
--   sibling B  → enrolling   ⇒ priority_children + all_children                      (2)
--
-- The asymmetry is the proof. If Search ever reports the same cohorts for both, a family
-- answer has leaked into a child destination.
--
-- Idempotent: participations are keyed on (subject, context), so re-running re-stages
-- rather than duplicating.
-- =============================================================================

DO $seed$
DECLARE
    v_org        uuid := '00000000-0000-4000-8000-000000000001';
    v_case       uuid := '00000000-0000-4000-8000-400000000a7c';
    v_sibling_a  uuid := '00000000-0000-4000-8000-30000000011c';
    v_sibling_b  uuid := '00000000-0000-4000-8000-3000000005cc';
    v_household  uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = v_org AND slug = 'northwind-early-learning') THEN
        RAISE EXCEPTION 'Refusing to run outside the disposable certification tenant.';
    END IF;

    SELECT customer_id INTO v_household FROM public.opportunities
     WHERE org_id = v_org AND id = v_case;
    IF v_household IS NULL THEN
        RAISE EXCEPTION 'certification case % is absent — the sibling fixture has no host', v_case;
    END IF;

    -- Both children must genuinely belong to the case's household, or "siblings sharing one
    -- case" is a claim about two unrelated records that happen to be seeded together.
    IF (SELECT count(*) FROM public.customer_members
         WHERE org_id = v_org AND customer_id = v_household
           AND id IN (v_sibling_a, v_sibling_b)) <> 2 THEN
        RAISE EXCEPTION 'the two siblings do not both belong to household % — the grain claim would be false', v_household;
    END IF;

    DELETE FROM public.process_instances
     WHERE org_id = v_org AND process_key = 'enrollment'
       AND context_type = 'opportunity' AND context_id = v_case
       AND subject_id IN (v_sibling_a, v_sibling_b);

    INSERT INTO public.process_instances
        (id, org_id, process_key, subject_type, subject_id, context_type, context_id,
         stage_key, state, metadata, created_at, stage_entered_at)
    VALUES
        (gen_random_uuid(), v_org, 'enrollment', 'child', v_sibling_a, 'opportunity', v_case,
         'waitlist',  'active', '{}'::jsonb, now(), now()),
        (gen_random_uuid(), v_org, 'enrollment', 'child', v_sibling_b, 'opportunity', v_case,
         'enrolling', 'active', '{}'::jsonb, now(), now());

    RAISE NOTICE 'Seeded sibling participations on case % (household %): % → waitlist, % → enrolling.',
        v_case, v_household, v_sibling_a, v_sibling_b;
END $seed$;

-- =============================================================================
-- Verification — the ASYMMETRY, not merely the rows.
-- =============================================================================
DO $verify$
DECLARE
    v_org       uuid := '00000000-0000-4000-8000-000000000001';
    v_case      uuid := '00000000-0000-4000-8000-400000000a7c';
    v_stages    text[];
BEGIN
    SELECT array_agg(DISTINCT stage_key ORDER BY stage_key) INTO v_stages
      FROM public.process_instances
     WHERE org_id = v_org AND context_type = 'opportunity' AND context_id = v_case
       AND subject_type = 'child';

    IF v_stages IS DISTINCT FROM ARRAY['enrolling', 'waitlist']::text[] THEN
        RAISE EXCEPTION 'siblings on one case hold stages % — the independence proof needs exactly {enrolling, waitlist}', v_stages;
    END IF;

    RAISE NOTICE 'Verified: two siblings on one case hold DIFFERENT child stages (%).', v_stages;
END $verify$;

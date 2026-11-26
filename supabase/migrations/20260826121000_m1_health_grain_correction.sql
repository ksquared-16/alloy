-- =============================================================================
-- M1 / D-H1 — move durable health values from the ENROLLMENT grain to the CHILD.
--
-- An allergy is a property of a child, not of an enrolment episode. Bound to the episode it does not
-- follow the child into next year's re-enrolment, and two of the three Forms subsystems already
-- disagreed with the shipped grain.
--
-- ── THIS MIGRATION REFUSES TO GUESS ──
--
-- An `enrollment`-grain value hangs off an episode, and an episode may contain SEVERAL children. So
-- "which child owns this value" is deterministic only when the episode has exactly one child
-- participant. Where it does not, the value is LEFT WHERE IT IS and reported. Putting one sibling's
-- allergy on another is precisely the failure this correction exists to prevent, and a migration
-- that guessed would cause it silently and at scale.
--
-- The census that preceded this run found 0 definitions at enrollment grain and 0 values in the
-- development/certification project, so here it is a no-op. It is written to be correct in an
-- environment that is not empty.
-- =============================================================================

DO $$
DECLARE
    v_def record;
    v_moved integer := 0;
    v_ambiguous integer := 0;
    v_total integer := 0;
BEGIN
    FOR v_def IN
        SELECT id, org_id, field_key
        FROM public.field_definitions
        WHERE field_key IN ('allergy_notes', 'medication_flag')
          AND entity_type = 'enrollment'
    LOOP
        -- Values whose episode has EXACTLY ONE child participant, and only those.
        WITH owner AS (
            SELECT fv.id AS value_id,
                   MIN(pi.subject_id::text)::uuid AS child_id,
                   COUNT(DISTINCT pi.subject_id) AS child_count
            FROM public.field_values fv
            JOIN public.process_instances pi
              ON pi.context_id = fv.entity_id
             AND pi.org_id = fv.org_id
             AND pi.subject_type = 'child'
            WHERE fv.org_id = v_def.org_id
              AND fv.field_definition_id = v_def.id
              AND fv.entity_type = 'enrollment'
            GROUP BY fv.id
        ),
        moved AS (
            UPDATE public.field_values fv
               SET entity_type = 'customer_member',
                   entity_id = owner.child_id,
                   updated_at = now()
              FROM owner
             WHERE fv.id = owner.value_id
               AND owner.child_count = 1
            RETURNING fv.id
        )
        SELECT COUNT(*) INTO v_moved FROM moved;

        SELECT COUNT(*) INTO v_total
          FROM public.field_values
         WHERE org_id = v_def.org_id
           AND field_definition_id = v_def.id;

        SELECT COUNT(*) INTO v_ambiguous
          FROM public.field_values
         WHERE org_id = v_def.org_id
           AND field_definition_id = v_def.id
           AND entity_type = 'enrollment';

        RAISE NOTICE 'M1 %/% — moved % of %, % left at enrollment grain (ambiguous owner)',
            v_def.org_id, v_def.field_key, v_moved, v_total, v_ambiguous;

        -- The DEFINITION only follows its values. Re-graining a definition while some of its values
        -- are still at the old grain would orphan them: the definition would say `customer_member`
        -- and the rows would say `enrollment`, and every read would silently miss them.
        IF v_ambiguous = 0 THEN
            UPDATE public.field_definitions
               SET entity_type = 'customer_member'
             WHERE id = v_def.id;
        ELSE
            RAISE WARNING
                'M1: definition % (%) NOT re-grained — % value(s) have no single owning child and were left in place for operator resolution',
                v_def.id, v_def.field_key, v_ambiguous;
        END IF;
    END LOOP;
END $$;

COMMENT ON TABLE public.field_values IS
    'Configured field values. Health values are CHILD-grain (customer_member) as of M1/D-H1 — an allergy belongs to the child, not to an enrolment episode.';

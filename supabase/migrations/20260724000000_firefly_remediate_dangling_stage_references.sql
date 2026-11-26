-- Firefly tenant remediation — remove dangling configured-stage references.
--
-- The Firefly enrollment process (org 93667019, dept 3933ac47) carries operator-authored
-- outcome rules that move to stages absent from its own process:
--   lead      → move_to_stage: qualification      (stage removed in Part 9; never re-added)
--   waitlist  → move_to_stage: enrollment         (process uses `enrolling`, not `enrollment`)
--   enrolling → move_to_stage: closed_withdrawn   (stage not configured for this tenant)
-- `decision` is a VALID configured stage and is preserved.
--
-- This mirrors lib/lifecycle/remediateDanglingStageReferences.ts. It removes only move_to_stage
-- targets whose destination is not in the process's own active stage set; where the correct
-- destination is a Product decision, the target is REMOVED (not repointed) — nothing is invented.
--
-- Idempotent: after one run there are no dangling targets, so a re-run rebuilds identical JSON.
-- Non-destructive to valid config: only dangling move_to_stage targets are dropped.

DO $$
DECLARE
    c_org_id     constant uuid := '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid;
    c_dept_id    constant uuid := '3933ac47-077a-4de8-aaac-8aed48d80413'::uuid;
    v_meta       jsonb;
    v_builder    jsonb;
    v_active_id  text;
    v_processes  jsonb;
    v_new_procs  jsonb := '[]'::jsonb;
    v_proc       jsonb;
    v_stage_keys text[];
    v_stages     jsonb;
    v_new_stages jsonb;
    v_stage      jsonb;
    v_plan       jsonb;
    v_rules      jsonb;
    v_new_rules  jsonb;
    v_rule       jsonb;
    v_targets    jsonb;
    v_new_tgts   jsonb;
    v_target     jsonb;
    v_dest       text;
    v_removed    int := 0;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orgs WHERE id = c_org_id) THEN
        RAISE NOTICE 'Firefly org absent; skipping stage-reference remediation.';
        RETURN;
    END IF;

    SELECT metadata INTO v_meta FROM public.departments WHERE id = c_dept_id AND org_id = c_org_id;
    IF v_meta IS NULL THEN RETURN; END IF;

    v_builder := v_meta->'lifecycle_builder_v1';
    IF v_builder IS NULL THEN RETURN; END IF;
    v_active_id := v_builder->>'active_process_id';
    v_processes := COALESCE(v_builder->'processes', '[]'::jsonb);

    FOR v_proc IN SELECT value FROM jsonb_array_elements(v_processes)
    LOOP
        v_stages := COALESCE(v_proc->'stages', '[]'::jsonb);

        -- Active configured stage keys for THIS process.
        SELECT array_agg(s->>'key')
          INTO v_stage_keys
          FROM jsonb_array_elements(v_stages) AS s
         WHERE COALESCE((s->>'is_active')::boolean, true);

        v_new_stages := '[]'::jsonb;
        FOR v_stage IN SELECT value FROM jsonb_array_elements(v_stages)
        LOOP
            v_plan := v_stage->'stage_operating_plan_v1';
            IF v_plan IS NULL THEN
                v_new_stages := v_new_stages || v_stage;
                CONTINUE;
            END IF;

            v_rules := COALESCE(v_plan->'outcome_rules', '[]'::jsonb);
            v_new_rules := '[]'::jsonb;
            FOR v_rule IN SELECT value FROM jsonb_array_elements(v_rules)
            LOOP
                v_targets := COALESCE(v_rule->'targets', '[]'::jsonb);
                v_new_tgts := '[]'::jsonb;
                FOR v_target IN SELECT value FROM jsonb_array_elements(v_targets)
                LOOP
                    IF v_target->>'kind' = 'move_to_stage' THEN
                        v_dest := v_target->>'stage_key';
                        -- Only direct stage_key targets are remediated here; transition_ref
                        -- targets resolve to configured transitions (Firefly has none dangling).
                        IF v_dest IS NOT NULL AND NOT (v_dest = ANY(v_stage_keys)) THEN
                            v_removed := v_removed + 1;
                            RAISE NOTICE 'Removing dangling move: stage % -> %', v_stage->>'key', v_dest;
                            CONTINUE; -- drop this target
                        END IF;
                    END IF;
                    v_new_tgts := v_new_tgts || v_target;
                END LOOP;
                v_new_rules := v_new_rules || jsonb_set(v_rule, '{targets}', v_new_tgts, true);
            END LOOP;

            v_plan := jsonb_set(v_plan, '{outcome_rules}', v_new_rules, true);
            v_stage := jsonb_set(v_stage, '{stage_operating_plan_v1}', v_plan, true);
            v_new_stages := v_new_stages || v_stage;
        END LOOP;

        v_proc := jsonb_set(v_proc, '{stages}', v_new_stages, true);
        v_new_procs := v_new_procs || v_proc;
    END LOOP;

    v_builder := jsonb_set(v_builder, '{processes}', v_new_procs, true);
    v_meta := jsonb_set(v_meta, '{lifecycle_builder_v1}', v_builder, true);

    UPDATE public.departments
       SET metadata = v_meta, updated_at = now()
     WHERE id = c_dept_id AND org_id = c_org_id;

    RAISE NOTICE 'Firefly stage-reference remediation complete: % dangling move target(s) removed.', v_removed;
END $$;

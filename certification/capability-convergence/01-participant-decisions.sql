-- Post-eradication capability convergence — configure the capabilities the cert tenant lacks.
--
-- WHY THIS EXISTS. The seeded representative tenant configures no `participant_decisions` and no
-- governed `family_close`, so the Decision and Close-family scenarios SKIP. A skip is not proof:
-- it reports convergence that was never exercised. This authors realistic configuration — the same
-- shapes a real tenant would publish — so the browser scenarios actually run.
--
-- SAFETY. Refuses to run anywhere but the disposable local certification tenant. The shared hosted
-- tenant is never touched, and no real QA family is closed by this script (it configures the
-- capability; the browser scenario only reads the preview).
--
-- WHY THE PROJECTION ESCAPE HATCH. `lifecycle_builder_v1` is publication-owned: direct writes are
-- refused, and the canonical route is `publish_business_process_revision_v1`. This is a fixture for
-- a disposable tenant, not a repair of a real one, and authoring a full draft revision here would
-- test the publication pipeline rather than the capability under certification. So it declares
-- itself with `begin_lifecycle_projection_write('migration')`, in the same transaction, exactly as
-- the guard's own hint prescribes — and the guard stays on for every other writer.
--
-- WHAT IT CONFIGURES, and why each piece is required:
--
--   command_set_v1            `resolveParticipantDecisionContext` refuses a decision whose
--                             capability the PROCESS did not select — the "stage orphan" guard that
--                             keeps `participant_decisions` from becoming a second command catalog.
--   participant_decisions     the per-child paths themselves, on the stage's work template.
--   completion_policy         `requires_all_participants_resolved` is the gate that makes the
--                             Decision surface load-bearing: without a path per child, the step
--                             cannot be completed.
--   family_close              the family-grain resolution of the same work, on the same template.

\set ON_ERROR_STOP on

do $$
declare
    v_org uuid;
    v_dept uuid;
begin
    perform begin_lifecycle_projection_write('migration');

    select id into v_org from orgs where slug = 'northwind-early-learning';
    if v_org is null then
        raise exception 'refusing to run: org northwind-early-learning not found (this is the local certification tenant fixture)';
    end if;

    select id into v_dept
    from departments
    where org_id = v_org and metadata ? 'lifecycle_builder_v1'
      and metadata->'lifecycle_builder_v1'->'processes'->0->>'key' = 'enrollment'
    limit 1;
    if v_dept is null then
        raise exception 'refusing to run: no department carries an enrollment lifecycle_builder_v1';
    end if;

    -- 1. Process selects the capabilities the decisions name. Without this the resolver refuses
    --    every decision as a stage orphan, and the surface renders nothing at all.
    update departments
    set metadata = jsonb_set(
        metadata,
        '{lifecycle_builder_v1,processes,0,command_set_v1}',
        jsonb_build_object(
            'version', 1,
            'commands', jsonb_build_array(
                jsonb_build_object('capability_key', 'waitlist_child', 'enabled', true),
                jsonb_build_object('capability_key', 'enroll_child', 'enabled', true),
                jsonb_build_object('capability_key', 'close_lead', 'enabled', true)
            )
        ),
        true
    )
    where id = v_dept;

    -- 2. Per-child paths + the completion gate + governed close, on the lead stage's primary
    --    work template (`contact_family`, index 0).
    update departments
    set metadata = jsonb_set(
        jsonb_set(
            jsonb_set(
                metadata,
                '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1,work_templates,0,participant_decisions}',
                jsonb_build_array(
                    jsonb_build_object(
                        'decision_key', 'waitlist_child',
                        'action_ref', 'waitlist_child',
                        'label', 'Waitlist',
                        'subject_grain', 'child',
                        'targets', jsonb_build_array(
                            jsonb_build_object('kind', 'update_child_enrollment_status', 'status_key', 'waitlisted')
                        )
                    ),
                    jsonb_build_object(
                        'decision_key', 'enroll_child',
                        'action_ref', 'enroll_child',
                        'label', 'Enroll',
                        'subject_grain', 'child',
                        'targets', jsonb_build_array(
                            jsonb_build_object('kind', 'update_child_enrollment_status', 'status_key', 'enrolled')
                        )
                    )
                ),
                true
            ),
            '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1,work_templates,0,completion_policy}',
            jsonb_build_object('requires_all_participants_resolved', true),
            true
        ),
        '{lifecycle_builder_v1,processes,0,stages,0,stage_operating_plan_v1,work_templates,0,family_close}',
        jsonb_build_object(
            'action_ref', 'close_lead',
            'label', 'Close family',
            'child_outcome_label', 'Not Enrolling',
            'child_targets', jsonb_build_array(
                jsonb_build_object('kind', 'update_child_enrollment_status', 'status_key', 'not_enrolling')
            ),
            'family_targets', jsonb_build_array(
                jsonb_build_object('kind', 'update_family_case_status', 'status_key', 'closed')
            )
        ),
        true
    )
    where id = v_dept;

    perform end_lifecycle_projection_write();
    raise notice 'configured participant_decisions + family_close on department %', v_dept;
end $$;

-- Report what a reader should see in the browser, so a silent no-op is visible here.
select
    d.name as department,
    jsonb_array_length(
        d.metadata->'lifecycle_builder_v1'->'processes'->0->'stages'->0
         ->'stage_operating_plan_v1'->'work_templates'->0->'participant_decisions'
    ) as participant_decisions,
    (d.metadata->'lifecycle_builder_v1'->'processes'->0->'stages'->0
      ->'stage_operating_plan_v1'->'work_templates'->0->'completion_policy'
      ->>'requires_all_participants_resolved') as requires_all_resolved,
    (d.metadata->'lifecycle_builder_v1'->'processes'->0->'stages'->0
      ->'stage_operating_plan_v1'->'work_templates'->0->'family_close'->>'action_ref') as family_close_action,
    jsonb_array_length(d.metadata->'lifecycle_builder_v1'->'processes'->0->'command_set_v1'->'commands') as selected_commands
from departments d
join orgs o on o.id = d.org_id
where o.slug = 'northwind-early-learning' and d.metadata ? 'lifecycle_builder_v1';

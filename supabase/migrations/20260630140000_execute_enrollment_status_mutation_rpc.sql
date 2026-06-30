-- Atomic RPC for enrollment status mutations.
-- Writes outcome_status_key on opportunity_customer_members AND inserts a mutation_events
-- outbox record in a single transaction.
-- Called exclusively by the Mutation Runtime (enrollmentStatus domain handler).
-- NEVER writes opportunities.status_key, persons.status_key, or customers.status_key.

create or replace function execute_enrollment_status_mutation(
    p_org_id          uuid,
    p_ocm_id          uuid,
    p_new_status_key  text,
    p_operator_id     text,
    p_origin          text,
    p_context_payload jsonb
) returns jsonb
language plpgsql
security definer
as $$
declare
    v_mutation_id  uuid := gen_random_uuid();
    v_previous_key text;
    v_opportunity_id uuid;
begin
    -- Lock and read current state
    select outcome_status_key, opportunity_id
    into v_previous_key, v_opportunity_id
    from opportunity_customer_members
    where id = p_ocm_id
      and org_id = p_org_id
    for update;

    if not found then
        raise exception 'ocm_not_found';
    end if;

    if v_previous_key = p_new_status_key then
        raise exception 'no_state_change';
    end if;

    -- Write canonical state (enrollment_status domain only)
    update opportunity_customer_members
    set outcome_status_key = p_new_status_key,
        updated_at         = now()
    where id     = p_ocm_id
      and org_id = p_org_id;

    -- Outbox record
    insert into mutation_events (
        id, org_id, mutation_id,
        command_key, domain,
        subject_id, subject_type,
        previous_state, new_state,
        operator_id, origin,
        context_payload
    ) values (
        gen_random_uuid(), p_org_id, v_mutation_id,
        'update_child_enrollment_status', 'enrollment_status',
        p_ocm_id, 'opportunity_customer_member',
        v_previous_key, p_new_status_key,
        p_operator_id, p_origin,
        p_context_payload
    );

    return jsonb_build_object(
        'ok',             true,
        'mutation_id',    v_mutation_id,
        'previous_state', v_previous_key,
        'new_state',      p_new_status_key,
        'opportunity_id', v_opportunity_id
    );
end;
$$;

-- Service role only
revoke all on function execute_enrollment_status_mutation(uuid, uuid, text, text, text, jsonb) from public;
grant execute on function execute_enrollment_status_mutation(uuid, uuid, text, text, text, jsonb) to service_role;

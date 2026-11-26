-- mutation_events: canonical outbox for operational mutations.
-- Written atomically with state changes via execute_lead_status_mutation() RPC.
-- Downstream: projections, automations, BOS subscribe to this table's events.

create table mutation_events (
    id              uuid primary key default gen_random_uuid(),
    org_id          uuid not null,
    mutation_id     uuid not null default gen_random_uuid(),
    command_key     text not null,
    domain          text not null,
    subject_id      uuid not null,
    subject_type    text not null,
    previous_state  text,
    new_state       text not null,
    operator_id     text,
    origin          text not null default 'operator'
                        check (origin in ('operator', 'automation', 'api', 'system')),
    override_reason text,
    context_payload jsonb,
    committed_at    timestamptz not null default now(),
    effective_at    timestamptz not null default now()
);

create index mutation_events_org_subject on mutation_events (org_id, subject_id, subject_type);
create index mutation_events_domain on mutation_events (org_id, domain, committed_at desc);

-- RLS: same service-role-only pattern as workflow_events
alter table mutation_events enable row level security;
create policy "mutation_events_service_role_only"
    on mutation_events
    using (false)
    with check (false);

-- Atomic RPC: writes state + outbox in one transaction.
-- Called from mutationRuntime.commit() instead of two separate round-trips.
create or replace function execute_lead_status_mutation(
    p_org_id          uuid,
    p_opportunity_id  uuid,
    p_new_status_key  text,
    p_operator_id     text,
    p_origin          text,
    p_context_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_old_status_key text;
    v_mutation_id    uuid := gen_random_uuid();
begin
    -- Read current state (will error if not found / wrong org)
    select status_key into v_old_status_key
    from opportunities
    where id = p_opportunity_id and org_id = p_org_id
    for update;

    if not found then
        raise exception 'opportunity_not_found';
    end if;

    if v_old_status_key = p_new_status_key then
        raise exception 'no_state_change';
    end if;

    -- Write state
    update opportunities
    set status_key = p_new_status_key,
        updated_at = now()
    where id = p_opportunity_id and org_id = p_org_id;

    -- Write outbox (same transaction — atomicity guaranteed)
    insert into mutation_events (
        org_id, mutation_id, command_key, domain,
        subject_id, subject_type,
        previous_state, new_state,
        operator_id, origin, context_payload,
        committed_at, effective_at
    ) values (
        p_org_id, v_mutation_id, 'update_lead_status', 'lead_status',
        p_opportunity_id, 'opportunity',
        v_old_status_key, p_new_status_key,
        p_operator_id, p_origin, p_context_payload,
        now(), now()
    );

    return jsonb_build_object(
        'ok',             true,
        'mutation_id',    v_mutation_id,
        'previous_state', v_old_status_key,
        'new_state',      p_new_status_key
    );
end;
$$;

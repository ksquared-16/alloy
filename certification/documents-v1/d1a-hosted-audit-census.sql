-- Documents V1 / D1a — hosted audit census. READ-ONLY, aggregate counts only.
--
-- Proves on the deployed primary that D1a's audit writer runs: after the merge (7a4de136, deployed
-- 2026-10-20T20:41:38Z) the hosted HTTP certification issued signed links, and each issuance must
-- have written a `document_link_issued` row to workflow_events BEFORE the link was minted.
-- Emits counts per event type and the latest occurrence time only — no ids, payloads or paths.
-- v00 is unconditional so a zero cannot be mistaken for a wrong target.
select question_id, 'data' as row_kind, payload
from (
    select 'v00_identity'::text as question_id,
           json_build_object(
               'ledger_head', (select max(version) from supabase_migrations.schema_migrations),
               'workflow_events_total', (select count(*) from public.workflow_events),
               'd1a_tagged_events', (select count(*) from public.workflow_events where payload ->> 'audit' = 'documents_v1_d1a')
           )::text as payload

    union all

    select 'v01_d1a_audit_by_type'::text,
           json_build_object(
               'event_type', g.event_type,
               'entity_type', g.entity_type,
               'events', g.n,
               'with_actor', g.with_actor,
               'with_route', g.with_route,
               'first_at', g.first_at,
               'last_at', g.last_at
           )::text
    from (
        select e.event_type,
               e.entity_type,
               count(*) as n,
               count(*) filter (where (e.payload ->> 'actor_user_id') is not null) as with_actor,
               count(*) filter (where (e.payload ->> 'route') is not null) as with_route,
               min(e.occurred_at) as first_at,
               max(e.occurred_at) as last_at
        from public.workflow_events e
        where e.payload ->> 'audit' = 'documents_v1_d1a'
          and e.occurred_at >= '2026-10-20T20:41:00Z'
        group by 1, 2
    ) g
) census
order by question_id, payload

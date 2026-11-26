select 'q1_installations_with_context_read' as question_id, 'row' as kind,
       json_build_object(
         'installation_id', i.id,
         'org_id', i.org_id,
         'application_id', i.application_id,
         'state', i.status,
         'granted_scopes', i.granted_scopes,
         'other_scope_count', (
            select count(*) from unnest(i.granted_scopes) s where s <> 'context.read'
         )
       ) as payload
from public.app_installations i
where 'context.read' = any(i.granted_scopes)
union all
select 'q2_totals', 'row',
       json_build_object(
         'installations_total', count(*),
         'installations_with_context_read', count(*) filter (where 'context.read' = any(granted_scopes)),
         'active_with_context_read', count(*) filter (where 'context.read' = any(granted_scopes) and status = 'active')
       )
from public.app_installations;

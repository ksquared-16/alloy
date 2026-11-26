select o.id::text || '|' || coalesce(to_jsonb(o)->>'status','') || '|' || coalesce(to_jsonb(o)->>'name','') from public.orgs o order by o.id;

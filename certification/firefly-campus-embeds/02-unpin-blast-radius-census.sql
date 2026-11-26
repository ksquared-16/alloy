-- Read-only: which links would 20261122190000_distribution_links_follow_latest_published un-pin?
select 'unpin_scope' as question_id, 'row' as kind, json_build_object(
  'would_unpin', (select count(*) from public.form_public_links
     where pinned_form_definition_version_id is not null and is_active
       and metadata->>'form_context_mode' = 'processing_intake' and metadata ? 'share_embed_path'),
  'by_org_form', (select json_agg(r) from (
     select l.org_id, fd.name as form_name, count(*) as links,
            bool_or(v.version_number < (select max(v2.version_number) from public.form_definition_versions v2
                                        where v2.form_definition_id = l.form_definition_id and v2.status = 'published')) as any_behind_latest
     from public.form_public_links l
     join public.form_definitions fd on fd.id = l.form_definition_id
     left join public.form_definition_versions v on v.id = l.pinned_form_definition_version_id
     where l.pinned_form_definition_version_id is not null and l.is_active
       and l.metadata->>'form_context_mode' = 'processing_intake' and l.metadata ? 'share_embed_path'
     group by l.org_id, fd.name order by count(*) desc limit 25) r),
  'pinned_active_links_total', (select count(*) from public.form_public_links
     where pinned_form_definition_version_id is not null and is_active)
)::text as payload;

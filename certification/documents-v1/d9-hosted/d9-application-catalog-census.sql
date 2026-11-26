-- D9 hosted QA, DEC-1: read-only census of the two D9 developer applications. It verifies each registration card's
-- result against the database and confirms that registration created no installation and no credential.
-- One statement, emitting question_id|kind|payload. Reads public.developer_applications, public.app_installations and
-- public.app_credentials, selecting by the two D9 slugs only. Writes nothing and returns no secret or hash column.
select question_id, kind, payload
from (
    select 'd9_app_' || s.slug as question_id,
           'row' as kind,
           json_build_object(
               'slug', s.slug,
               'present', a.id is not null,
               'id', a.id,
               'status', a.status,
               'ownership_mode', a.ownership_mode,
               'environment', a.environment,
               'distribution_mode', a.distribution_mode,
               'publisher', a.publisher,
               'created_at', a.created_at,
               'installations', (select count(*)::int from public.app_installations i where i.application_id = a.id),
               'credentials', (select count(*)::int from public.app_credentials c
                                 join public.app_installations i on i.id = c.installation_id
                                where i.application_id = a.id)
           )::text as payload,
           s.ord as sort_key
      from (values ('d9-documents-read-cert', 1), ('d9-documents-scope-cert', 2)) as s(slug, ord)
      left join public.developer_applications a on a.slug = s.slug
) q
order by sort_key;

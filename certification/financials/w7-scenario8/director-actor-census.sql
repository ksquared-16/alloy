-- W7-F002 / Scenario 8 — WHO created the Director's QA draft charges, and can that login be named?
--
-- Read-only, one statement. For every login that created a charge in the staging org in the last
-- three days: its roles, whether it is a managed QA identity (boolean, never the address), its
-- active person links, and the display name its auth profile carries. Then the persons whose full
-- name equals that display name exactly — CANDIDATES for an operator to choose between, never a
-- match applied by this query. No email is used to find or rank a person.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
creators as (
  select ch.created_by as user_id, count(*) as charges,
         max(ch.created_at) as last_created,
         json_agg(json_build_object('id', ch.id, 'status', ch.status, 'category', ch.charge_category,
                                    'template', (select t.label from financial_charge_templates t where t.id = ch.charge_template_id),
                                    'amount_cents', ch.amount_cents, 'service_date', ch.service_date,
                                    'billable_on', ch.billable_on, 'due_date', ch.due_date, 'created_at', ch.created_at)
                  order by ch.created_at desc) as recent
    from charges ch, org
   where ch.org_id = org.id and ch.created_by is not null and ch.created_at > now() - interval '3 days'
   group by ch.created_by
)
select 'creator', 'row', json_build_object(
  'label', c.user_id,
  'managed_qa_identity', coalesce(u.email ilike 'qa-%@example.com', false),
  'auth_display_name', coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  'charges_3d', c.charges,
  'recent', (select json_agg(r) from (select * from json_array_elements(c.recent) limit 6) r),
  'roles', (select json_agg(r.role) from user_roles r, org where r.user_id = c.user_id and r.org_id = org.id),
  'active_links', (select json_agg(json_build_object('person', p.full_name, 'person_id', p.id, 'source', p.external_source))
                     from user_person_links l join persons p on p.id = l.person_id, org
                    where l.user_id = c.user_id and l.org_id = org.id and l.status = 'active' and l.revoked_at is null),
  'name_candidates', (select json_agg(json_build_object('person_id', p.id, 'full_name', p.full_name, 'status', p.status_key, 'source', p.external_source,
                                                       'linked_to_other_user', exists (select 1 from user_person_links l2 where l2.person_id = p.id and l2.status = 'active' and l2.revoked_at is null)))
                        from persons p, org
                       where p.org_id = org.id
                         and coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name') is not null
                         and lower(p.full_name) = lower(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')))
)::text
from creators c left join auth.users u on u.id = c.user_id
order by 3

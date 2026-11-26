-- W7-F012 — does every login that can move money on the staging tenant resolve to a NAMED person?
--
-- One row per login holding any role in the organization: its roles, whether it is a managed QA
-- identity (example.com / qa- shaped — reported as a boolean, never the address), and the named
-- person its active `user_person_links` row resolves to. The path is the one
-- financialActorIdentity reads: auth.users.id → user_person_links (active) → persons. Read-only.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
logins as (
  select distinct r.user_id from user_roles r, org where r.org_id = org.id
)
select 'actor_link', 'row', json_build_object(
  'label', l.user_id,
  'managed_qa_identity', coalesce(u.email ilike 'qa-%@example.com', false),
  'roles', (select json_agg(to_jsonb(r) - 'user_id' - 'org_id' - 'created_at') from user_roles r, org where r.user_id = l.user_id and r.org_id = org.id),
  'active_links', (select json_agg(json_build_object('person', p.full_name, 'person_source', p.external_source, 'linked_at', ul.linked_at))
                     from user_person_links ul join persons p on p.id = ul.person_id, org
                    where ul.user_id = l.user_id and ul.org_id = org.id and ul.status = 'active' and ul.revoked_at is null),
  'financial_rows_created', (select count(*) from charges ch, org where ch.org_id = org.id and ch.created_by = l.user_id)
)::text
from logins l left join auth.users u on u.id = l.user_id
order by 3

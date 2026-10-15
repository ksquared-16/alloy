-- W7-F002 (corrected) — after the Director's login was named in Access → Users on deployed 0660ae82.
-- Read-only, one statement. Proves: the login carries an account name; it has NO Person link and no
-- Person was created for it; the edit was recorded as an access mutation event that changed no link;
-- the named-operator predicate now holds without a link. No email is read.
with org as (select '93667019-bd28-49b5-a688-acc9bb1e0a19'::uuid as id),
dir as (select 'b2562c99-24dd-404b-b692-a0c4676d5bdf'::uuid as id)
select 'director', 'state', json_build_object(
  'label', 'director_login',
  'account_name', public.user_account_display_name(dir.id),
  'active_person_links', (select count(*) from user_person_links l where l.org_id = org.id and l.user_id = dir.id and l.status = 'active'),
  'any_person_links_ever', (select count(*) from user_person_links l where l.org_id = org.id and l.user_id = dir.id),
  'persons_named_like_account_created_today', (select count(*) from persons p where p.org_id = org.id
                                                  and lower(p.full_name) = lower(coalesce(public.user_account_display_name(dir.id), '-'))
                                                  and p.created_at > now() - interval '1 day'),
  'named_operator_identity', public.user_has_named_operator_identity(org.id, dir.id),
  'roles', (select json_agg(r.role) from user_roles r where r.org_id = org.id and r.user_id = dir.id)
)::text
from org, dir
union all
select 'audit', 'row', json_build_object(
  'label', 'account_name_changed',
  'command_key', e.command_key, 'domain', e.domain, 'origin', e.origin,
  'subject_is_director', e.subject_id::text = 'b2562c99-24dd-404b-b692-a0c4676d5bdf',
  'operator_id', e.operator_id, 'previous_state', e.previous_state, 'new_state', e.new_state,
  'person_link_changed', e.context_payload -> 'person_link_changed',
  'committed_at', e.committed_at
)::text
from mutation_events e, org
where e.org_id = org.id and e.command_key = 'access.user.account_name_changed'

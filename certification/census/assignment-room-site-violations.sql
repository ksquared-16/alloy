-- Live schedule_assignments whose room does not resolve to the row's site, or is not an operational
-- group; and predecessors with more than one successor. Read only, counts and ids only.
-- One statement, one row: question_id | kind | payload(json).
with live as (
    select s.id, s.org_id, s.subject_type, s.is_primary, s.commitment_kind, s.site_location_id, s.room_location_id, s.status,
           public.location_site_id(s.room_location_id) as room_site,
           public.location_unit_role(s.room_location_id) as room_role
    from public.schedule_assignments s
    where s.room_location_id is not null and s.status in ('planned', 'active', 'ending')
),
bad as (
    select *, (room_site is distinct from site_location_id) as wrong_site, (room_role is distinct from 'operational_group') as not_group from live
)
select 'room_site' as question_id, 'json' as kind, json_build_object(
    'live_with_room', (select count(*) from live),
    'by_class', (select json_agg(x) from (
        select subject_type, is_primary, commitment_kind, count(*) filter (where wrong_site) as wrong_site,
               count(*) filter (where not_group) as not_group, count(*) as total
        from bad group by 1, 2, 3 order by 1, 2, 3) x),
    'wrong_site_rows', (select json_agg(json_build_object('id', id, 'org', org_id, 'subject', subject_type, 'primary', is_primary,
               'site', site_location_id, 'room', room_location_id, 'room_site', room_site, 'role', room_role)) from bad where wrong_site),
    'not_group_rows', (select json_agg(json_build_object('id', id, 'subject', subject_type, 'primary', is_primary, 'role', room_role)) from bad where not_group),
    'closed_with_wrong_site', (select count(*) from public.schedule_assignments s
               where s.room_location_id is not null and s.status not in ('planned', 'active', 'ending')
                 and public.location_site_id(s.room_location_id) is distinct from s.site_location_id),
    'multi_successor_predecessors', (select count(*) from (select supersedes_assignment_id from public.schedule_assignments
               where supersedes_assignment_id is not null group by 1 having count(*) > 1) d)
)::jsonb::text as payload;

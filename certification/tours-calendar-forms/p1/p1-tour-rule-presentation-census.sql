-- Tours P1-A: why does Monday appear twice? Every tour availability rule on ALLOY_STAGING, grouped by
-- scope × schedule × weekday × window, with its location label. Schedule names and times only — no
-- family, booking or contact data. tour_availability_rules and locations predate this sprint.
-- jsonb throughout: json_agg separates elements with newlines, and the census reads one row per line.
SELECT 'p1_tour_rules' AS question_id,
       'row' AS kind,
       jsonb_build_object(
         'rules_total', (SELECT count(*) FROM public.tour_availability_rules),
         'groups', (
           SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.org_id, g.scope, g.day_of_week, g.start_time), '[]'::jsonb)
           FROM (
             SELECT r.org_id,
                    CASE WHEN r.location_id IS NULL THEN 'organization' ELSE 'location' END AS scope,
                    r.location_id,
                    l.label AS location_label,
                    r.metadata -> 'tour_schedule' ->> 'id' AS schedule_id,
                    r.metadata -> 'tour_schedule' ->> 'name' AS schedule_name,
                    r.day_of_week,
                    r.start_time::text AS start_time,
                    r.end_time::text AS end_time,
                    r.is_active,
                    r.approval_required,
                    r.slot_duration_minutes,
                    r.max_bookings_per_slot,
                    count(*) AS rule_rows
             FROM public.tour_availability_rules r
             LEFT JOIN public.locations l ON l.id = r.location_id
             GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
           ) g
         )
       )::text AS payload

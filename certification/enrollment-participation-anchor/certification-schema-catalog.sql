-- Catalog inspection for the Enrollment final census. READ-ONLY, and deliberately tiny.
--
-- WHY THIS EXISTS SEPARATELY. The final census (gar_d1d706004e28bd) failed `execution_failed` with
-- no detail, and the likely cause is that it named columns the deployed schema does not have — a
-- mistake this program has already made twice (`status_key` and `location_id` on the operational
-- tables, both asserted and both absent). Guessing again would burn another governed action to
-- learn the same thing.
--
-- SO THIS ASKS THE CATALOG, NOT THE DATA. It reads `information_schema.columns` only. It cannot
-- fail on a column being absent, because absence is precisely what it reports — which is what makes
-- it safe to run before the census it is meant to repair.
--
-- Output is the labeled `question_id|row_kind|payload` form the trusted parser accepts, and it
-- leads with an unconditional row so an empty match can never be read as `result_parse_failed`.
select question_id, 'data' as row_kind, payload
from (
    -- ALWAYS ONE ROW. Which of the census's tables exist at all, before any column is discussed.
    select 'tables_present'::text as question_id,
           json_build_object(
               'looked_for', 15,
               'found', (
                   select count(*) from information_schema.tables t
                   where t.table_schema = 'public'
                     and t.table_name in (
                         'persons', 'customer_persons', 'customers', 'customer_members',
                         'opportunities', 'opportunity_customer_members', 'process_instances',
                         'form_packet_sessions', 'form_packet_session_items', 'form_submissions',
                         'enrollment_requirement_exceptions', 'child_enrollment_agreements',
                         'child_placements', 'schedule_assignments', 'org_settings'
                     )
               ),
               'names', (
                   select coalesce(json_agg(t.table_name order by t.table_name), '[]'::json)
                   from information_schema.tables t
                   where t.table_schema = 'public'
                     and t.table_name in (
                         'persons', 'customer_persons', 'customers', 'customer_members',
                         'opportunities', 'opportunity_customer_members', 'process_instances',
                         'form_packet_sessions', 'form_packet_session_items', 'form_submissions',
                         'enrollment_requirement_exceptions', 'child_enrollment_agreements',
                         'child_placements', 'schedule_assignments', 'org_settings'
                     )
               )
           )::text as payload

    union all

    -- A SCHEDULE-ASSIGNMENT TABLE MAY NOT BE CALLED THAT. Reported by pattern rather than by the
    -- name the census assumed, so the real one is named even if the guess was wrong.
    select 'schedule_like_tables'::text,
           json_build_object('table', t.table_name)::text
    from information_schema.tables t
    where t.table_schema = 'public'
      and (t.table_name like '%schedule%' or t.table_name like '%assignment%')

    union all

    -- One row per table: its columns and their types, which is the whole point.
    select 'columns'::text,
           json_build_object(
               'table', c.table_name,
               'columns', (
                   select coalesce(json_agg(
                       json_build_object('name', c2.column_name, 'type', c2.data_type, 'nullable', c2.is_nullable)
                       order by c2.ordinal_position
                   ), '[]'::json)
                   from information_schema.columns c2
                   where c2.table_schema = 'public' and c2.table_name = c.table_name
               )
           )::text
    from (
        select distinct t.table_name
        from information_schema.tables t
        where t.table_schema = 'public'
          and t.table_name in (
              'persons', 'customer_persons', 'customers', 'customer_members',
              'opportunities', 'opportunity_customer_members', 'process_instances',
              'form_packet_sessions', 'form_packet_session_items', 'form_submissions',
              'enrollment_requirement_exceptions', 'child_enrollment_agreements',
              'child_placements', 'schedule_assignments', 'org_settings'
          )
    ) c
) census
order by question_id, payload

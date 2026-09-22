-- Read-only census v2: is the topology backstop's LOGIC live on the deployed
-- primary?
--
-- V1 OF THIS CENSUS ASKED THE WRONG QUESTION AND IS THE REASON V2 EXISTS.
-- It searched prosrc for `existing_children_incompatible` and
-- `active_placement_incompatible` and got false for both, which reads as "the
-- guards are missing". Those two identifiers are the API layer's refusal CODES,
-- returned by topologyMutationAuthority.ts; the migration never contains them.
-- The SQL raises human messages instead. A literal that cannot appear cannot be
-- found, and the absence looked exactly like a defect.
--
-- So v2 greps for what the function actually says. The strings below are copied
-- from the three UPDATE-only guards in
-- 20260919160000_location_topology_mutation_backstop.sql.
--
-- Output obeys the trusted-host parser: question_id | kind | payload, value in
-- the payload position, no `row_count` kind.
select question_id, kind, payload
from (
    select
        'guard_children'::text  as question_id,
        'present'::text         as kind,
        (coalesce((
            select p.prosrc like '%still contains%nested room(s)%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
            limit 1), false))::text as payload,
        'b1'::text              as sort_key

    union all

    select
        'guard_live_placement'::text,
        'present'::text,
        (coalesce((
            select p.prosrc like '%live placement(s)%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
            limit 1), false))::text,
        'b2'::text

    union all

    select
        'guard_cross_site_move'::text,
        'present'::text,
        (coalesce((
            select p.prosrc like '%may not move to a different site%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
            limit 1), false))::text,
        'b3'::text

    union all

    -- The placement guard must actually consult child_placements; a message
    -- without the query would be a guard that never fires.
    select
        'reads_child_placements'::text,
        'present'::text,
        (coalesce((
            select p.prosrc like '%child_placements%'
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
            limit 1), false))::text,
        'b4'::text

    union all

    -- Length of the live function body, so "which version is this" is answerable
    -- rather than inferred from the ledger row alone.
    select
        'fn_body_chars'::text,
        'length'::text,
        (coalesce((
            select length(p.prosrc)
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
            limit 1), 0))::text,
        'b5'::text
) rows
order by sort_key;

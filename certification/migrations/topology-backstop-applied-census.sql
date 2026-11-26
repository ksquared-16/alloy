-- SUPERSEDED — THIS CENSUS ASKED AN INVALID QUESTION. DO NOT CITE ITS RESULTS.
--
-- Filed as gar_3ffe71c83835aa on 2026-09-20T10:54:51Z. It returned
-- fn_has_children_guard=false and fn_has_placement_guard=false, which reads as
-- "the topology safety guards never reached production". THAT CONCLUSION IS
-- WRONG.
--
-- The two literals below, `existing_children_incompatible` and
-- `active_placement_incompatible`, are the API layer's refusal codes returned by
-- web/lib/location/topologyMutationAuthority.ts. The migration never contains
-- them: its SQL raises human messages instead. A literal that cannot appear
-- cannot be found, so the false readings measured the question, not the database.
--
-- Its other three answers ARE sound and were structural rather than textual:
-- ledger_has_backstop=true, index_live_by_room=true, trigger_attached=true.
--
-- Superseded by topology-backstop-applied-census-v2.sql (gar_f3d0503fddfe67),
-- which greps the guard text the migration actually raises and returned true for
-- all three guards, with the function body at 6529 chars.
--
-- Read-only census: did 20260919160000_location_topology_mutation_backstop
-- actually reach the deployed primary?
--
-- WHY THIS EXISTS AS ITS OWN ARTIFACT. `database.apply_promoted_migration`
-- refused this migration with `production_precondition_refused — Hosted parity
-- already reports PASS; there is no gap for this mutation to close`, while the
-- ledger census taken minutes earlier did NOT list 20260919160000 among the
-- hosted versions. Those two readings disagree, and a parity verdict is a
-- summary: it cannot distinguish "the gap is closed" from "the gap is not yet
-- visible to the measurement". So this asks for the OBJECTS, not the verdict.
--
-- It is a separate file rather than a re-run of hosted-migration-identity-census
-- because `database.read_census` dedupes on the sha256 of the query bytes within
-- a run, and a repeat replays the earlier answer while looking fresh. New bytes,
-- new hash, genuine reading.
--
-- Output obeys the trusted-host parser: `question_id | kind | payload`, with the
-- value in the payload position, and no `row_count` kind (the parser consumes
-- that as a count assignment rather than a row).
select question_id, kind, payload
from (
    -- 1. The ledger row itself. Absent means the migration never ran here.
    select
        'ledger_has_backstop'::text as question_id,
        'present'::text             as kind,
        (exists (
            select 1 from supabase_migrations.schema_migrations m
            where m.version = '20260919160000'
        ))::text                    as payload,
        'a1'::text                  as sort_key

    union all

    -- 2. The index the migration creates. Independent of the ledger: it is the
    --    schema answering for itself.
    select
        'index_live_by_room'::text,
        'present'::text,
        (exists (
            select 1 from pg_indexes
            where schemaname = 'public'
              and indexname = 'idx_child_placements_live_by_room'
        ))::text,
        'a2'::text

    union all

    -- 3. The guard clauses. The trigger function predates this migration, so its
    --    EXISTENCE proves nothing — only the backstop's own refusal codes do.
    select
        'fn_has_children_guard'::text,
        'present'::text,
        (coalesce(
            (select p.prosrc like '%existing_children_incompatible%'
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
             limit 1), false))::text,
        'a3'::text

    union all

    select
        'fn_has_placement_guard'::text,
        'present'::text,
        (coalesce(
            (select p.prosrc like '%active_placement_incompatible%'
             from pg_proc p
             join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'validate_location_hierarchy'
             limit 1), false))::text,
        'a4'::text

    union all

    -- 4. The trigger is still attached, so the guards are reachable rather than
    --    merely defined.
    select
        'trigger_attached'::text,
        'present'::text,
        (exists (
            select 1 from pg_trigger t
            join pg_class c on c.oid = t.tgrelid
            where c.relname = 'locations'
              and t.tgname = 'trg_validate_location_hierarchy'
              and not t.tgisinternal
        ))::text,
        'a5'::text
) rows
order by sort_key;

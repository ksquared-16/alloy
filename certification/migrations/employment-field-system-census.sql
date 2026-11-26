-- Read-only census: what does the Canonical Field System already hold for
-- Employment, and does any certification-shaped field already exist?
--
-- Slice 2 was authorized on the premise that entity_type='employment' is blocked
-- by a Field System CHECK constraint. Source review found no such constraint —
-- field_definitions.entity_type and field_values.entity_type are plain text —
-- so this measures the DATA side of that question rather than assuming it.
--
-- It also carries the slice's certification guard: certifications must NOT be
-- implemented as generic employment fields, so any existing CPR / first-aid /
-- background-check / license / training field is inventoried here as input to a
-- future qualification slice, never migrated or reinterpreted by this one.
--
-- No field labels or values are emitted, only counts and entity-type names. A
-- field label can carry tenant-identifying wording, and the question "does one
-- exist" is answerable without exporting it.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    select 'defs_employment'::text, 'count'::text,
           (select count(*)::text from public.field_definitions where entity_type = 'employment'), 'a1'::text
    union all
    select 'values_employment'::text, 'count'::text,
           (select count(*)::text from public.field_values where entity_type = 'employment'), 'a2'::text
    union all
    -- Every entity_type actually in use, so "employment is unsupported" can be
    -- checked against reality rather than against a registry.
    select 'defs_entity_types_in_use'::text, 'list'::text,
           (select coalesce(string_agg(distinct entity_type, ' '), 'none') from public.field_definitions), 'a3'::text
    union all
    select 'values_entity_types_in_use'::text, 'list'::text,
           (select coalesce(string_agg(distinct entity_type, ' '), 'none') from public.field_values), 'a4'::text
    union all
    -- Certification guard: qualification-shaped definitions anywhere, by count.
    select 'cert_shaped_defs_any_entity'::text, 'count'::text,
           (select count(*)::text from public.field_definitions
            where field_key ~* '(cpr|first_?aid|background|clearance|license|licence|certif|training|immuniz|fingerprint)'
               or label     ~* '(cpr|first aid|background|clearance|license|licence|certif|training|immuniz|fingerprint)'), 'b1'::text
    union all
    -- Which entity types those sit on, so the future slice knows where to look.
    select 'cert_shaped_entity_types'::text, 'list'::text,
           (select coalesce(string_agg(distinct entity_type, ' '), 'none') from public.field_definitions
            where field_key ~* '(cpr|first_?aid|background|clearance|license|licence|certif|training|immuniz|fingerprint)'
               or label     ~* '(cpr|first aid|background|clearance|license|licence|certif|training|immuniz|fingerprint)'), 'b2'::text
    union all
    -- A custom definition shadowing a NATIVE employment column would be the
    -- collision Slice 2 must prevent. badge_number is included because Slice 1
    -- added that column without adding it to the reserved key set.
    select 'defs_shadowing_native_employment'::text, 'count'::text,
           (select count(*)::text from public.field_definitions
            where field_key = ANY (ARRAY['employment_status','employment_type','position_id',
                                         'primary_location_id','external_employee_id','badge_number',
                                         'start_date','end_date','end_reason_key'])
              and entity_type = 'employment'), 'b3'::text
    union all
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'b4'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;

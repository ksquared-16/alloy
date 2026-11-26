-- Read-only census: does any existing data already own Staff qualifications,
-- and what does the target authority have to coexist with?
--
-- Slice 3 may only create new authority after proving no canonical owner exists.
-- Source review already found none in schema or code — `app_credentials` is auth
-- and `organization_provider_credential_events` is payments — so this measures
-- the DATA side, including the three certification-shaped field definitions the
-- Slice 2 census found on location/vendor, which must be classified and NOT
-- auto-migrated.
--
-- No labels, keys or values are emitted, only counts and entity-type names. A
-- field label can carry tenant wording and a qualification is about a named
-- person; "does one exist" is answerable without exporting either.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    -- 1. Certification-shaped FIELD DEFINITIONS, by entity type. Slice 2 found 3
    --    on location and vendor. Re-measured here, classified, never migrated.
    select 'cert_shaped_defs_total'::text, 'count'::text,
           (select count(*)::text from public.field_definitions
            where field_key ~* '(cpr|first_?aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food_?handler)'
               or label     ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food handler)'), 'a1'::text
    union all
    select 'cert_shaped_defs_entity_types'::text, 'list'::text,
           (select coalesce(string_agg(distinct entity_type, ' '), 'none') from public.field_definitions
            where field_key ~* '(cpr|first_?aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food_?handler)'
               or label     ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food handler)'), 'a2'::text
    union all
    -- Do any of them carry VALUES? A definition with no values is vocabulary
    -- debt; one with values is data that a migration decision would have to own.
    select 'cert_shaped_values_total'::text, 'count'::text,
           (select count(*)::text from public.field_values fv
            join public.field_definitions fd on fd.id = fv.field_definition_id
            where fd.field_key ~* '(cpr|first_?aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food_?handler)'
               or fd.label    ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|fingerprint|food handler)'), 'a3'::text
    union all
    -- 2. Any EMPLOYMENT field definition at all (Slice 2 left three inactive).
    select 'employment_defs_total'::text, 'count'::text,
           (select count(*)::text from public.field_definitions where entity_type = 'employment'), 'b1'::text
    union all
    select 'employment_defs_active'::text, 'count'::text,
           (select count(*)::text from public.field_definitions where entity_type = 'employment' and is_active), 'b2'::text
    union all
    -- 3. FORMS estate — the evidence authority qualifications must reference
    --    rather than duplicate.
    select 'form_definitions'::text, 'count'::text,
           (select count(*)::text from public.form_definitions), 'c1'::text
    union all
    select 'form_submissions'::text, 'count'::text,
           (select count(*)::text from public.form_submissions), 'c2'::text
    union all
    select 'form_submission_documents'::text, 'count'::text,
           (select count(*)::text from public.form_submission_documents), 'c3'::text
    union all
    -- Forms whose NAME suggests they already collect a staff credential.
    select 'cert_shaped_form_definitions'::text, 'count'::text,
           (select count(*)::text from public.form_definitions
            where name ~* '(cpr|first aid|background|clearance|licen[cs]e|certif|training|immuniz|food handler)'), 'c4'::text
    union all
    -- 4. The applicability axes a requirement policy would bind to.
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'd1'::text
    union all
    select 'employment_positions'::text, 'count'::text,
           (select count(*)::text from public.employment_positions), 'd2'::text
    union all
    select 'sites'::text, 'count'::text,
           (select count(*)::text from public.locations where location_type = 'site'), 'd3'::text
    union all
    select 'operational_assignment_types'::text, 'count'::text,
           (select count(*)::text from public.operational_assignment_types), 'd4'::text
    union all
    -- Is the latent staff axis actually populated anywhere?
    select 'assignment_types_admitting_staff'::text, 'count'::text,
           (select count(*)::text from public.operational_assignment_types
            where 'staff' = ANY (subject_types)), 'd5'::text
    union all
    select 'assignment_types_staffing_supply'::text, 'count'::text,
           (select count(*)::text from public.operational_assignment_types
            where staffing_participation = 'supply'), 'd6'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;

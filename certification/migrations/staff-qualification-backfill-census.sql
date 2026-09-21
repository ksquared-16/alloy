-- Read-only census: did Slice 3 fabricate any qualification facts?
--
-- The claim under test is that the migration creates AUTHORITY and nothing else.
-- No credential was invented from a Form, from an Employment configurable field,
-- or from ambiguous historical Immunization data — so every one of the four
-- tables must be EMPTY on a database where no operator has yet authored anything.
--
-- ── WHY THIS IS A SECOND ARTIFACT ──
--
-- Counting rows names the relation, and Postgres plans the whole statement before
-- running any of it. A single `from public.staff_qualification_types` therefore
-- fails the ENTIRE census with `relation does not exist` whenever the tables are
-- absent — which is exactly the state a schema census exists to report. The
-- structural census (staff-qualification-schema-census.sql) is catalog-only and
-- safe in both states; this one is deliberately NOT, and is run only after that
-- census has proved the four tables present.
--
-- Output obeys the trusted-host parser: question_id | kind | payload.
select question_id, kind, payload
from (
    -- Zero is the expected answer for all four. A non-zero count on a database
    -- where nobody has authored anything is a backfill, whatever produced it.
    select 'qualification_types_total'::text, 'count'::text,
           (select count(*)::text from public.staff_qualification_types), 'c01'::text
    union all
    select 'qualifications_total'::text, 'count'::text,
           (select count(*)::text from public.staff_qualifications), 'c02'::text
    union all
    select 'qualification_evidence_total'::text, 'count'::text,
           (select count(*)::text from public.staff_qualification_evidence), 'c03'::text
    union all
    select 'qualification_requirements_total'::text, 'count'::text,
           (select count(*)::text from public.staff_qualification_requirements), 'c04'::text

    -- ── THE SOURCES THAT MUST NOT HAVE BEEN MINED ──
    -- Reported as context, not as a pass. These are the populations a backfill
    -- would have drawn from; showing them beside four zeros is what makes the
    -- zeros mean "nothing was migrated" rather than "there was nothing to take".
    union all
    select 'employments_total'::text, 'count'::text,
           (select count(*)::text from public.employments), 'c05'::text
    union all
    select 'documents_total'::text, 'count'::text,
           (select count(*)::text from public.documents), 'c06'::text
    union all
    -- The Employment configurable-field boundary: qualifications must never have
    -- become field values on the employment entity.
    select 'employment_field_definitions'::text, 'count'::text,
           (select count(*)::text from public.field_definitions
            where entity_type='employment'), 'c07'::text
    union all
    select 'employment_field_values'::text, 'count'::text,
           (select count(*)::text from public.field_values
            where entity_type='employment'), 'c08'::text
) rows(question_id, kind, payload, sort_key)
order by sort_key;

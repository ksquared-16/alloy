-- Read-only census: can employments.external_employee_id carry an org-unique
-- invariant, and what does the credential estate look like today?
--
-- Decisions 1 and 4 of Staff & Workforce V2 both say "census before proposing a
-- constraint". This measures exactly the failure modes a UNIQUE index would hit
-- and nothing else.
--
-- NO RAW IDENTIFIER VALUES ARE EMITTED. Every answer is a count or a shape.
-- An employee number is an organization-facing identifier about a named human,
-- so the question "are there collisions" is answerable without exporting the
-- identifiers themselves, and the narrower query is the one that should exist.
--
-- Output obeys the trusted-host parser: question_id | kind | payload, value in
-- the payload position, and no `row_count` kind.
select question_id, kind, payload
from (
    select 'emp_total'::text, 'count'::text, count(*)::text, 'a1'::text
    from public.employments

    union all
    -- Populated vs absent: a partial UNIQUE index only governs populated rows.
    select 'emp_id_populated'::text, 'count'::text,
           count(*) filter (where external_employee_id is not null
                              and length(btrim(external_employee_id)) > 0)::text,
           'a2'::text
    from public.employments

    union all
    select 'emp_id_null_or_blank'::text, 'count'::text,
           count(*) filter (where external_employee_id is null
                              or length(btrim(external_employee_id)) = 0)::text,
           'a3'::text
    from public.employments

    union all
    -- EXACT collisions: what a naive UNIQUE (org_id, external_employee_id) hits.
    select 'collision_groups_exact'::text, 'count'::text, count(*)::text, 'b1'::text
    from (
        select org_id, external_employee_id
        from public.employments
        where external_employee_id is not null and length(btrim(external_employee_id)) > 0
        group by org_id, external_employee_id
        having count(*) > 1
    ) g

    union all
    -- NORMALIZED collisions: trimmed + case-folded. If this exceeds the exact
    -- count, normalization is a prerequisite rather than a nicety.
    select 'collision_groups_normalized'::text, 'count'::text, count(*)::text, 'b2'::text
    from (
        select org_id, lower(btrim(external_employee_id)) as norm
        from public.employments
        where external_employee_id is not null and length(btrim(external_employee_id)) > 0
        group by org_id, lower(btrim(external_employee_id))
        having count(*) > 1
    ) g

    union all
    -- Rows whose stored value is not already normalized: the backfill size.
    select 'needs_normalization'::text, 'count'::text,
           count(*) filter (where external_employee_id is distinct from btrim(external_employee_id))::text,
           'b3'::text
    from public.employments

    union all
    -- Placeholder-shaped values, which defeat uniqueness by meaning "unknown".
    select 'placeholder_shaped'::text, 'count'::text,
           count(*) filter (where lower(btrim(coalesce(external_employee_id,'')))
                                  in ('n/a','na','none','tbd','unknown','0','-','--','x'))::text,
           'b4'::text
    from public.employments

    union all
    -- Credential estate, for Decision 1's "preserve a future credential family".
    select 'kiosk_codes_active'::text, 'count'::text,
           count(*) filter (where status = 'active')::text, 'c1'::text
    from public.person_kiosk_codes

    union all
    select 'kiosk_codes_persons'::text, 'count'::text,
           count(distinct person_id)::text, 'c2'::text
    from public.person_kiosk_codes

    union all
    -- More than one active code per person today? Decides whether a credential
    -- FAMILY is a new shape or already the de-facto one.
    select 'persons_multi_active_code'::text, 'count'::text, count(*)::text, 'c3'::text
    from (
        select person_id from public.person_kiosk_codes
        where status = 'active' group by person_id having count(*) > 1
    ) m

    union all
    select 'employments_active'::text, 'count'::text,
           count(*) filter (where employment_status in ('pending_start','active','ending'))::text,
           'c4'::text
    from public.employments
) rows(question_id, kind, payload, sort_key)
order by sort_key;

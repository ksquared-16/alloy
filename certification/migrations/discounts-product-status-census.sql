-- Read-only census: is the discount_programs stack adopted, and does anything still apply it?
--
-- Three role-title gates sit on POST/PATCH/DELETE /api/admin/discounts. Source says the authoring UI
-- is legacy-admin only - DiscountsClient is mounted by its own legacy page and embedded in the
-- legacy Pricing client, the one nav link lives in AdminLayout which only legacy-admin renders, and
-- no adminV2 page imports it. But the DATA is not obviously legacy: discount_programs is read by
-- jobs, opportunities, booking validation, quote patching and campaigns.
--
-- Crucially this is NOT the childcare reduction model. The Financials program said so itself when it
-- created `financial_reduction_applications`: "that table belongs to a different vertical... its
-- discount_program_id REFERENCES discount_programs, the jobs/booking discount stack". Childcare
-- policy is authored in commercial_policies. So the question is not "has Financials replaced this"
-- but "is the jobs/booking vertical still using it".
--
-- created_by is not available on these rows, so provenance is read from WHAT references a program
-- and when, rather than from an author column.
--
-- Counts and dates only; no tenant-authored names are read.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    select 'programs'::text, 'summary'::text,
           ('rows=' || count(*)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' first=' || coalesce(min(created_at)::date::text,'none')
            || ' last_created=' || coalesce(max(created_at)::date::text,'none')
            || ' last_updated=' || coalesce(max(updated_at)::date::text,'never'))::text,
           'a1'::text
    from public.discount_programs

    union all
    -- Did these come from the older discount_codes model, or were they authored fresh?
    select 'migrated_from_codes'::text, 'provenance'::text,
           ('with_legacy_discount_code_id=' || count(*) filter (where legacy_discount_code_id is not null)::text
            || ' authored_fresh=' || count(*) filter (where legacy_discount_code_id is null)::text)::text,
           'a2'::text
    from public.discount_programs

    union all
    select 'supporting_rows'::text, 'structure'::text,
           ('benefits=' || (select count(*) from public.discount_program_benefits)::text
            || ' qualifiers=' || (select count(*) from public.discount_program_qualifiers)::text
            || ' commitment_rules=' || (select count(*) from public.discount_program_commitment_rules)::text)::text,
           'a3'::text

    union all
    -- THE DECISIVE ONE. discount_applications is where a program actually reduces money. Zero rows
    -- means the catalog exists and nothing has ever been applied from it.
    select 'applications'::text, 'decisive'::text,
           ('rows=' || count(*)::text
            || ' orgs=' || count(distinct org_id)::text
            || ' first=' || coalesce(min(created_at)::date::text,'none')
            || ' last=' || coalesce(max(created_at)::date::text,'none')
            || ' distinct_programs_applied=' || count(distinct discount_program_id)::text)::text,
           'b1'::text
    from public.discount_applications

    union all
    -- What KIND of target do those applications point at? The Financials note says the targets are
    -- customer / opportunity / job / subscription - the jobs-and-booking vertical.
    select 'application_targets'::text, 'decisive'::text,
           ('with_job=' || count(*) filter (where job_id is not null)::text
            || ' with_opportunity=' || count(*) filter (where opportunity_id is not null)::text
            || ' with_customer=' || count(*) filter (where customer_id is not null)::text
            || ' with_subscription=' || count(*) filter (where customer_subscription_id is not null)::text)::text,
           'b2'::text
    from public.discount_applications

    union all
    -- The canonical childcare peer, for contrast: is the OTHER model the one carrying real activity?
    select 'canonical_peer'::text, 'context'::text,
           ('commercial_policies=' || (select count(*) from public.commercial_policies)::text
            || ' financial_reduction_applications=' || (select count(*) from public.financial_reduction_applications)::text)::text,
           'c1'::text

    union all
    -- The older model this one superseded. Still populated?
    select 'legacy_codes'::text, 'context'::text,
           ('discount_codes=' || (select count(*) from public.discount_codes)::text)::text,
           'c2'::text

    union all
    -- PROBE 1: is a discount program identity NOT NULL anywhere the current product writes?
    select 'not_null_probe'::text, 'probe'::text,
           (coalesce(string_agg(table_name || '.' || column_name || '=' || is_nullable, ' ~ ' order by table_name), 'none'))::text,
           'd1'::text
    from information_schema.columns
    where table_schema='public' and column_name in ('discount_program_id','discount_code_id')

    union all
    select 'nonvacuity'::text, 'guard'::text,
           ('programs_table=' || (to_regclass('public.discount_programs') is not null)::text
            || ' applications_table=' || (to_regclass('public.discount_applications') is not null)::text
            || ' orgs=' || (select count(*) from public.orgs)::text
            || ' jobs=' || (select count(*) from public.jobs)::text)::text,
           'zz0'::text
) q(question_id, kind, payload, sort_key)
order by sort_key;

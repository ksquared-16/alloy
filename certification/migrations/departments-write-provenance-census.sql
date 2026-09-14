-- Read-only census: WHO writes department rows, and WHAT do they store?
--
-- The prior census (gar_4801886a81e716) proved five department rows on the deployed primary, last
-- updated 2026-09-12, with thirty-one business_process_revisions structurally depending on them.
-- That was read as "the concept is live". The convergence review then found the mechanism: the
-- Lifecycle create flow (web/lib/lifecycle/clientCreateLifecycleViaBuilder.ts) POSTs a department
-- row as the runtime identity of a new Lifecycle, stamping metadata key `lifecycle_builder_owned_v1`;
-- the attention/SLA settings page PATCHes `metadata.opportunity_attention_rules` through the same
-- row; and the Lifecycle rename syncs `departments.name`.
--
-- So recent writes do not prove that anyone is ADMINISTERING departments. This asks the database to
-- attribute each row instead: which are lifecycle-authored envelopes, which are seeded platform
-- domains, and which — if any — are hand-authored departments with no lifecycle marker at all.
--
-- Metadata KEY NAMES only, never values: the question is provenance, not tenant content.
--
-- Output contract: question_id | kind | payload. One statement, no DDL, no writes.
select question_id, kind, payload
from (
    -- Per row: age, liveness, and which authoring system stamped it. `key` is already disclosed by
    -- the prior census; names and metadata values are deliberately not read.
    select 'row_' || d.key as question_id, 'provenance' as kind,
           ('active=' || d.is_active::text
            || ' created=' || d.created_at::date::text
            || ' updated=' || coalesce(d.updated_at::date::text, 'never')
            || ' builder_owned=' || (d.metadata ? 'lifecycle_builder_owned_v1')::text
            || ' activation_owned=' || (d.metadata ? 'lifecycle_activation_owned_v1')::text
            || ' builder_doc=' || (d.metadata ? 'lifecycle_builder_v1')::text
            || ' attention_rules=' || (d.metadata ? 'opportunity_attention_rules')::text
            || ' meta_keys=' || coalesce(
                   (select count(*)::text from jsonb_object_keys(coalesce(d.metadata, '{}'::jsonb)) k), '0')
           )::text as payload,
           'a_' || d.key as sort_key
    from public.departments d

    union all
    -- The decisive aggregate: is ANY row free of every lifecycle marker? Such a row would be a
    -- genuine hand-authored department and would defeat the "lifecycle envelope" reading.
    select 'unmarked_rows', 'decisive',
           ('rows_with_no_lifecycle_marker=' || count(*) filter (
                where not (coalesce(metadata,'{}'::jsonb) ?| array[
                    'lifecycle_builder_owned_v1','lifecycle_activation_owned_v1','lifecycle_builder_v1'])
            )::text
            || ' of_total=' || count(*)::text)::text,
           'b1'
    from public.departments

    union all
    -- Which metadata keys exist at all, across the tenant. Names only.
    select 'meta_key', 'vocabulary',
           (k || ' x' || count(*)::text)::text, 'c_' || k
    from public.departments d, jsonb_object_keys(coalesce(d.metadata, '{}'::jsonb)) k
    group by k

    union all
    -- Does the row that business processes depend on carry a lifecycle marker? If revisions hang off
    -- builder-owned rows, department_id is a lifecycle identity, not an org-chart reference.
    select 'bp_revisions_by_marker', 'dependency',
           ('on_lifecycle_marked_departments=' || count(*) filter (
                where coalesce(d.metadata,'{}'::jsonb) ?| array[
                    'lifecycle_builder_owned_v1','lifecycle_activation_owned_v1','lifecycle_builder_v1'])::text
            || ' on_unmarked=' || count(*) filter (
                where not (coalesce(d.metadata,'{}'::jsonb) ?| array[
                    'lifecycle_builder_owned_v1','lifecycle_activation_owned_v1','lifecycle_builder_v1']))::text
            || ' total=' || count(*)::text)::text,
           'd1'
    from public.business_process_revisions r
    join public.departments d on d.id = r.department_id and d.org_id = r.org_id

    union all
    -- Same question for the runtime queue rows.
    select 'work_units_by_marker', 'dependency',
           ('on_lifecycle_marked_departments=' || count(*) filter (
                where coalesce(d.metadata,'{}'::jsonb) ?| array[
                    'lifecycle_builder_owned_v1','lifecycle_activation_owned_v1','lifecycle_builder_v1'])::text
            || ' on_unmarked=' || count(*) filter (
                where not (coalesce(d.metadata,'{}'::jsonb) ?| array[
                    'lifecycle_builder_owned_v1','lifecycle_activation_owned_v1','lifecycle_builder_v1']))::text
            || ' total=' || count(*)::text)::text,
           'd2'
    from public.work_units w
    join public.departments d on d.id = w.department_id and d.org_id = w.org_id

    union all
    -- Non-vacuity: a zero everywhere above must be distinguishable from "wrong tenant / empty read".
    select 'nonvacuity', 'guard',
           ('departments=' || (select count(*) from public.departments)::text
            || ' orgs=' || (select count(distinct org_id) from public.departments)::text
            || ' bp_revisions=' || (select count(*) from public.business_process_revisions)::text)::text,
           'z1'
) q
order by sort_key;

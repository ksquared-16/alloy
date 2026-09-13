-- Read-only census: can `financial_reduction_applications` accept the Thread 7
-- policy-provenance invariant WITHOUT breaking any row that already exists?
--
-- WHY THIS RUNS BEFORE THE MIGRATION. The migration replaces an integrity CHECK.
-- A CHECK is validated against every existing row when it is added, so a single
-- historical row that contradicts the new invariant turns a schema change into a
-- failed migration on the deployed primary. That is a safe failure — nothing is
-- corrupted — but it is a failure discovered at the worst moment, and it is
-- entirely predictable from a read. So it is read first.
--
-- WHAT THE NEW INVARIANT WILL SAY. For `reduction_kind = 'policy'`, exactly one
-- policy authority: `commercial_policy_id` XOR `financial_policy_id`. Neither is
-- a reduction that cannot explain itself; both is a row with two authorities and
-- no way to tell which decided. `manual` keeps its existing law — a reason — and
-- the census reports whether the stronger form (manual carries no policy id) is
-- already true, so the constraint can be tightened only if history permits.
--
-- Every count below is a number the migration's success depends on. `violations`
-- is the one that stops it.
select question_id, kind, payload
from (
    select 'totals'::text as question_id, 'row'::text as kind,
           ('all ~ ' || count(*)::text)::text as payload, '1a'::text as sort_key
    from public.financial_reduction_applications
    union all
    select 'totals', 'row', 'policy ~ ' || count(*)::text, '1b'
    from public.financial_reduction_applications where reduction_kind = 'policy'
    union all
    select 'totals', 'row', 'manual ~ ' || count(*)::text, '1c'
    from public.financial_reduction_applications where reduction_kind = 'manual'
    union all
    select 'totals', 'row', 'other_kind ~ ' || count(*)::text, '1d'
    from public.financial_reduction_applications where reduction_kind not in ('policy', 'manual')

    -- Policy lineage as it stands today. Every policy row is expected to carry a
    -- commercial policy, because that is the only authority the schema has had.
    union all
    select 'policy_lineage', 'row', 'with_commercial ~ ' || count(*)::text, '2a'
    from public.financial_reduction_applications
    where reduction_kind = 'policy' and commercial_policy_id is not null
    union all
    select 'policy_lineage', 'row', 'without_commercial ~ ' || count(*)::text, '2b'
    from public.financial_reduction_applications
    where reduction_kind = 'policy' and commercial_policy_id is null
    union all
    select 'policy_lineage', 'row', 'null_policy_kind ~ ' || count(*)::text, '2c'
    from public.financial_reduction_applications
    where reduction_kind = 'policy' and policy_kind is null

    -- The stronger manual form: tightened only if history already obeys it.
    union all
    select 'manual_lineage', 'row', 'manual_with_commercial_policy ~ ' || count(*)::text, '3a'
    from public.financial_reduction_applications
    where reduction_kind = 'manual' and commercial_policy_id is not null
    union all
    select 'manual_lineage', 'row', 'manual_without_reason ~ ' || count(*)::text, '3b'
    from public.financial_reduction_applications
    where reduction_kind = 'manual' and nullif(btrim(coalesce(reason, '')), '') is null

    -- THE NUMBER THAT DECIDES. Rows the proposed policy XOR would reject.
    union all
    select 'violations', 'row', 'policy_xor_violations ~ ' || count(*)::text, '4a'
    from public.financial_reduction_applications
    where reduction_kind = 'policy'
      and (commercial_policy_id is null or policy_kind is null)

    -- The vocabulary in use, so the widened CHECK keeps every value already stored.
    union all
    select 'policy_kinds', 'row', coalesce(policy_kind, '(null)') || ' ~ ' || count(*)::text, '5' || coalesce(policy_kind, '~null')
    from public.financial_reduction_applications
    group by policy_kind

    -- Does the column already exist? A migration that adds it twice is a
    -- migration somebody has already half-run.
    union all
    select 'column_present', 'value',
           (exists (select 1 from information_schema.columns
                     where table_schema = 'public'
                       and table_name = 'financial_reduction_applications'
                       and column_name = 'financial_policy_id'))::text,
           '6'
) rows
order by sort_key;

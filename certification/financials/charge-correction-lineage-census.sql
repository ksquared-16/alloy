-- Can the deployed database accept a rule that a posted charge is corrected ONCE?
--
-- `charge.reverse` shipped with no bound: `createChildcareCorrection` checks only that its source is
-- posted, the Financials card offers Reverse on every posted row, and a reversed original still
-- renders as `posted` — so the same charge can be reversed twice (the balance goes negative by its
-- amount) and a reversal can itself be reversed without end. The fix is a DB-authoritative bound:
-- at most one live reversal per source charge, and no correction OF a correction.
--
-- A UNIQUE INDEX fails to build if the deployed data already violates it, so this asks whether it
-- does — before the migration asserts it, not after a deploy discovers it. Counts only, no row data.
--
-- Q1 — does any charge already carry more than one live reversal? Each such source would break the
--      unique index, and each is a family credited twice for one charge.
select
    'duplicate_live_reversals'                              as question_id,
    'sources_with_more_than_one_live_reversal'              as name,
    count(*)::text                                          as detail
from (
    select c.source_charge_id
    from public.charges c
    where c.source_charge_id is not null
      and c.status <> 'void'
      and c.metadata ->> 'correction_kind' = 'reversal'
    group by c.source_charge_id
    having count(*) > 1
) dupes

union all

-- Q2 — does any correction point at a row that is ITSELF a correction? Those are the unbounded
--      chains: reversing a reversal reinstates the charge and admits another, forever.
select
    'corrections_of_corrections'                            as question_id,
    'corrections_whose_source_is_itself_a_correction'       as name,
    count(*)::text                                          as detail
from public.charges child
join public.charges parent
  on parent.id = child.source_charge_id
where child.source_charge_id is not null
  and parent.source_charge_id is not null

union all

-- Q3 — how much correction history exists at all, and on which billable sources? Establishes
--      whether the bound is being asserted over an empty table or over real posted money.
select
    'existing_corrections'                                  as question_id,
    coalesce(c.billable_source_type, 'null_source')         as name,
    count(*)::text                                          as detail
from public.charges c
where c.source_charge_id is not null
group by coalesce(c.billable_source_type, 'null_source')

union all

-- Q4 — is any such bound already present? An index or constraint on the correction lineage would
--      mean the guarantee exists and only the service and the card are missing it.
select
    'existing_lineage_constraints'                          as question_id,
    i.indexname                                             as name,
    'index'                                                 as detail
from pg_indexes i
where i.schemaname = 'public'
  and i.tablename = 'charges'
  and i.indexdef like '%source_charge_id%'

order by question_id, name;

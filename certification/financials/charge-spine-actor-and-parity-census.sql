-- Does the deployed database (a) attribute a charge to an actor, and (b) apply the childcare money
-- guarantees to the `customer` billable source it already admits?
--
-- Both were read from the migration tree and the code, which is inference. This settles them against
-- the deployed database: three questions, one row per fact, no table data.
--
-- Q1 — actor columns on charges. `chargeLifecycleService` already wrote `updated_by`; if the column
--      is absent there, that write path could only ever have failed against a real database.
select
    'charges_actor_columns'                as question_id,
    c.column_name                          as name,
    c.data_type                            as detail
from information_schema.columns c
where c.table_schema = 'public'
  and c.table_name = 'charges'
  and c.column_name in ('created_by', 'updated_by', 'posted_by')

union all

-- Q2 — does posted-charge immutability cover `customer`, or only `enrollment_agreement`?
select
    'charge_immutability_trigger'          as question_id,
    p.proname                              as name,
    case
        when pg_get_functiondef(p.oid) like '%customer%' then 'covers_customer'
        else 'enrollment_agreement_only'
    end                                    as detail
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'enforce_childcare_charge_immutability'

union all

-- Q3 — does the RESTRICTIVE childcare write role gate cover `customer`?
select
    'childcare_write_rolegate'             as question_id,
    pol.polrelid::regclass::text           as name,
    case
        when pg_get_expr(pol.polwithcheck, pol.polrelid) like '%customer%' then 'covers_customer'
        else 'enrollment_agreement_only'
    end                                    as detail
from pg_policy pol
where pol.polname like '%_childcare_write_rolegate'

order by question_id, name;

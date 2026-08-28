-- Does the deployed database admit `customer` as a billable source?
--
-- The code already lists it (`BILLABLE_SOURCE_TYPES`), and the migration that widens the CHECK
-- exists in this worktree but is in no promoted SHA. This census settles which side of that gap the
-- DEPLOYED database is on, rather than inferring it from the migration tree.
select
    rel.relname                                   as table_name,
    con.conname                                   as constraint_name,
    pg_get_constraintdef(con.oid)                 as definition,
    pg_get_constraintdef(con.oid) like '%customer%' as admits_customer
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname in ('charges', 'ledger_transactions')
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid) like '%billable_source_type%'
order by rel.relname, con.conname;

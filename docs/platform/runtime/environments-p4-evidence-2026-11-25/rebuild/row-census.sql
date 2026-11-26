-- Exact row counts for every non-empty table in public (what the migration chain itself writes).
create temp table rc(tbl text, n bigint);
do $$ declare r record; k bigint; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p') loop
    execute format('select count(*) from public.%I', r.relname) into k;
    if k > 0 then insert into rc values (r.relname, k); end if;
  end loop; end $$;
select tbl, n from rc order by tbl;

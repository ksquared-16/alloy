-- Rolled-back trial: what does inserting one org provision by itself (triggers only)?
begin;
insert into public.orgs (id, name, slug, industry_id)
values ('00000000-0000-4000-8000-00000000f004', 'P4 rehearsal placeholder', 'p4_rehearsal_placeholder',
        (select id from public.industries where key = 'childcare'));
create temp table rc(tbl text, n bigint);
do $$ declare r record; k bigint; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
           join pg_attribute a on a.attrelid=c.oid and a.attname='org_id' and not a.attisdropped
           where n.nspname='public' and c.relkind in ('r','p') loop
    execute format('select count(*) from public.%I where org_id = %L', r.relname, '00000000-0000-4000-8000-00000000f004') into k;
    if k > 0 then insert into rc values (r.relname, k); end if;
  end loop; end $$;
select tbl, n from rc order by tbl;
rollback;

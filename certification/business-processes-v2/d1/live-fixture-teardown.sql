-- Remove ONLY this suite's fixture orgs (slug bpv2-d1-live-*) and their org-scoped rows. Local cert stack.
begin;
create temp table _fx on commit drop as select id from public.orgs where slug like 'bpv2-d1-live-%';
create temp table _fx_users on commit drop as select distinct user_id from public.user_roles where org_id in (select id from _fx);
do $$
declare t record; pass int := 0; remaining int; n int; err text;
begin
  set local session_replication_role = replica; -- skip append-only/audit triggers for fixture teardown only
  loop
    pass := pass + 1; remaining := 0;
    for t in select c.table_schema, c.table_name from information_schema.columns c
             join information_schema.tables tb on tb.table_schema=c.table_schema and tb.table_name=c.table_name and tb.table_type='BASE TABLE'
             where c.table_schema='public' and c.column_name='org_id' and c.table_name <> 'orgs' loop
      begin
        execute format('delete from %I.%I where org_id in (select id from _fx)', t.table_schema, t.table_name);
      exception when others then remaining := remaining + 1;
      end;
    end loop;
    exit when remaining = 0 or pass >= 6;
  end loop;
  delete from public.orgs where id in (select id from _fx);
  get diagnostics n = row_count;
  raise notice 'passes=% orgs_deleted=% tables_still_failing=%', pass, n, remaining;
end $$;
delete from auth.users where id in (select user_id from _fx_users) and email like 'bpv2-d1-%@example.com';
select count(*) as fixture_orgs_left from public.orgs where slug like 'bpv2-d1-live-%';
commit;

create or replace function public.reset_org_data(
  p_org_id uuid,
  p_keep_master_entities boolean default true,
  p_scrub_financials boolean default true
)
returns void
language plpgsql
as $$
declare
begin
  create temporary table if not exists _delete_customers(id uuid) on commit drop;
  create temporary table if not exists _delete_opportunities(id uuid) on commit drop;
  create temporary table if not exists _delete_jobs(id uuid) on commit drop;
  create temporary table if not exists _delete_schedules(id uuid) on commit drop;
  create temporary table if not exists _delete_subscriptions(id uuid) on commit drop;
  create temporary table if not exists _keep_vendor_contacts(id uuid) on commit drop;
  create temporary table if not exists _keep_vendor_persons(id uuid) on commit drop;

  truncate _delete_customers, _delete_opportunities, _delete_jobs, _delete_schedules, _delete_subscriptions, _keep_vendor_contacts, _keep_vendor_persons;

  if to_regclass('public.customers') is not null then
    insert into _delete_customers
    select id from public.customers where org_id = p_org_id;
  end if;

  if to_regclass('public.opportunities') is not null then
    insert into _delete_opportunities
    select id from public.opportunities where org_id = p_org_id;
  end if;

  if to_regclass('public.jobs') is not null then
    insert into _delete_jobs
    select id from public.jobs where org_id = p_org_id;
  end if;

  if to_regclass('public.schedules') is not null then
    insert into _delete_schedules
    select id from public.schedules where org_id = p_org_id;
  end if;

  if to_regclass('public.customer_subscriptions') is not null then
    insert into _delete_subscriptions
    select id
    from public.customer_subscriptions
    where org_id = p_org_id
       or customer_id in (select id from _delete_customers);
  end if;

  if p_keep_master_entities and to_regclass('public.vendors') is not null then
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'vendors' and column_name = 'primary_person_id'
    ) then
      insert into _keep_vendor_persons
      select distinct primary_person_id
      from public.vendors
      where org_id = p_org_id
        and primary_person_id is not null;
    end if;

    if to_regclass('public.contacts') is not null then
      if exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'contacts' and column_name = 'vendor_id'
      ) then
        insert into _keep_vendor_contacts
        select c.id
        from public.contacts c
        join public.vendors v on v.id = c.vendor_id
        where v.org_id = p_org_id;

        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'contacts' and column_name = 'person_id'
        ) then
          insert into _keep_vendor_persons
          select distinct c.person_id
          from public.contacts c
          join public.vendors v on v.id = c.vendor_id
          where v.org_id = p_org_id
            and c.person_id is not null
          on conflict do nothing;
        end if;
      end if;
    end if;
  end if;

  if to_regclass('public.action_links') is not null then
    delete from public.action_links where org_id = p_org_id;
  end if;

  if to_regclass('public.messages') is not null and to_regclass('public.workflow_runs') is not null then
    delete from public.messages
    where workflow_run_id in (
      select id from public.workflow_runs where org_id = p_org_id
    )
    or (
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'customer_id'
      )
      and customer_id in (select id from _delete_customers)
    )
    or (
      exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'related_entity_id'
      )
      and related_entity_id in (
        select id from _delete_jobs
        union
        select id from _delete_opportunities
      )
    );
  end if;

  if to_regclass('public.workflow_runs') is not null then
    delete from public.workflow_runs where org_id = p_org_id;
  end if;

  if to_regclass('public.workflow_events') is not null then
    delete from public.workflow_events where org_id = p_org_id;
  end if;

  if to_regclass('public.assignments') is not null then
    delete from public.assignments
    where (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'assignments' and column_name = 'org_id'
           ) and org_id = p_org_id)
       or (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'assignments' and column_name = 'job_id'
           ) and job_id in (select id from _delete_jobs))
       or (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'assignments' and column_name = 'schedule_id'
           ) and schedule_id in (select id from _delete_schedules));
  end if;

  if to_regclass('public.cleaning_job_details') is not null then
    delete from public.cleaning_job_details where job_id in (select id from _delete_jobs);
  end if;

  if to_regclass('public.discount_redemptions') is not null then
    delete from public.discount_redemptions
    where (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'discount_redemptions' and column_name = 'customer_id'
           ) and customer_id in (select id from _delete_customers))
       or (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'discount_redemptions' and column_name = 'job_id'
           ) and job_id in (select id from _delete_jobs))
       or (exists (
             select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'discount_redemptions' and column_name = 'opportunity_id'
           ) and opportunity_id in (select id from _delete_opportunities));
  end if;

  if to_regclass('public.document_versions') is not null and to_regclass('public.documents') is not null then
    delete from public.document_versions
    where document_id in (
      select d.id
      from public.documents d
      where d.org_id = p_org_id
        and (
          d.entity_type in ('customer','opportunity','job','schedule')
          or d.entity_id in (
            select id from _delete_customers
            union
            select id from _delete_opportunities
            union
            select id from _delete_jobs
            union
            select id from _delete_schedules
          )
        )
    );
  end if;

  if to_regclass('public.documents') is not null then
    delete from public.documents
    where org_id = p_org_id
      and (
        entity_type in ('customer','opportunity','job','schedule')
        or entity_id in (
          select id from _delete_customers
          union
          select id from _delete_opportunities
          union
          select id from _delete_jobs
          union
          select id from _delete_schedules
        )
      );
  end if;

  if to_regclass('public.schedules') is not null then
    delete from public.schedules where id in (select id from _delete_schedules);
  end if;

  if to_regclass('public.customer_subscriptions') is not null then
    delete from public.customer_subscriptions where id in (select id from _delete_subscriptions);
  end if;

  if to_regclass('public.jobs') is not null then
    delete from public.jobs where id in (select id from _delete_jobs);
  end if;

  if to_regclass('public.opportunities') is not null then
    delete from public.opportunities where id in (select id from _delete_opportunities);
  end if;

  if p_scrub_financials then
    if to_regclass('public.ledger_transactions') is not null then
      delete from public.ledger_transactions where org_id = p_org_id;
    end if;

    if to_regclass('public.gl_journal_entries') is not null then
      if to_regclass('public.gl_journal_lines') is not null then
        if exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'gl_journal_lines' and column_name = 'journal_entry_id'
        ) then
          delete from public.gl_journal_lines
          where journal_entry_id in (
            select id from public.gl_journal_entries where org_id = p_org_id
          );
        elsif exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'gl_journal_lines' and column_name = 'gl_journal_entry_id'
        ) then
          delete from public.gl_journal_lines
          where gl_journal_entry_id in (
            select id from public.gl_journal_entries where org_id = p_org_id
          );
        elsif exists (
          select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'gl_journal_lines' and column_name = 'org_id'
        ) then
          delete from public.gl_journal_lines where org_id = p_org_id;
        end if;
      end if;

      delete from public.gl_journal_entries where org_id = p_org_id;
    end if;
  end if;

  if not p_keep_master_entities then
    if to_regclass('public.customer_members') is not null then
      delete from public.customer_members where customer_id in (select id from _delete_customers);
    end if;

    if to_regclass('public.customer_persons') is not null then
      delete from public.customer_persons where customer_id in (select id from _delete_customers);
    end if;

    if to_regclass('public.contacts') is not null then
      delete from public.contacts
      where org_id = p_org_id
        and id not in (select id from _keep_vendor_contacts);
    end if;

    if to_regclass('public.customers') is not null then
      delete from public.customers where id in (select id from _delete_customers);
    end if;

    if to_regclass('public.persons') is not null then
      delete from public.persons
      where org_id = p_org_id
        and id not in (select id from _keep_vendor_persons);
    end if;
  end if;
end;
$$;
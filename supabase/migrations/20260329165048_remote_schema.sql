


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "admin";


ALTER SCHEMA "admin" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'ops'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "admin"."wipe_org_data"("p_org_id" "uuid", "p_confirm" "text", "p_include_workflows" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_expected text := 'WIPE:' || p_org_id::text;
  v_counts jsonb := '{}'::jsonb;
  v_rc bigint;
begin
  if p_confirm is null or p_confirm <> v_expected then
    raise exception 'Refusing to wipe. confirm must equal %', v_expected;
  end if;

  -- IMPORTANT: delete children first, parent last.
  -- Everything is scoped to org_id.

  -- Outbox / messages
  delete from public.messages_outbox where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{messages_outbox}', to_jsonb(v_rc), true);

  delete from public.messages where job_id in (select id from public.jobs where org_id = p_org_id);
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{messages}', to_jsonb(v_rc), true);

  -- Action links
  delete from public.action_links where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{action_links}', to_jsonb(v_rc), true);

  -- Ledger / GL
  delete from public.ledger_transactions where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{ledger_transactions}', to_jsonb(v_rc), true);

  delete from public.gl_journal_lines where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{gl_journal_lines}', to_jsonb(v_rc), true);

  delete from public.gl_journal_entries where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{gl_journal_entries}', to_jsonb(v_rc), true);

  -- Payments / assignments / schedules / jobs
  delete from public.payments where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{payments}', to_jsonb(v_rc), true);

  delete from public.assignments where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{assignments}', to_jsonb(v_rc), true);

  delete from public.schedules where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{schedules}', to_jsonb(v_rc), true);

  delete from public.jobs where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{jobs}', to_jsonb(v_rc), true);

  -- Sales objects
  delete from public.quotes where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{quotes}', to_jsonb(v_rc), true);

  delete from public.opportunities where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{opportunities}', to_jsonb(v_rc), true);

  -- Locations / contacts / customers (FK order matters)
  delete from public.locations where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{locations}', to_jsonb(v_rc), true);

  -- join tables that might exist for this org via contacts/customers
  delete from public.contact_tags where contact_id in (select id from public.contacts where org_id = p_org_id);
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{contact_tags}', to_jsonb(v_rc), true);

  delete from public.customer_tags where customer_id in (select id from public.customers where org_id = p_org_id);
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{customer_tags}', to_jsonb(v_rc), true);

  delete from public.contacts where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{contacts}', to_jsonb(v_rc), true);

  delete from public.customers where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{customers}', to_jsonb(v_rc), true);

  -- Documents (if you store org docs)
  delete from public.documents where org_id = p_org_id;
  get diagnostics v_rc = row_count;
  v_counts := jsonb_set(v_counts,'{documents}', to_jsonb(v_rc), true);

  -- Optional: workflow tables (OFF by default)
  if p_include_workflows then
    delete from public.workflow_actions where org_id = p_org_id;
    get diagnostics v_rc = row_count;
    v_counts := jsonb_set(v_counts,'{workflow_actions}', to_jsonb(v_rc), true);

    delete from public.workflow_conditions where org_id = p_org_id;
    get diagnostics v_rc = row_count;
    v_counts := jsonb_set(v_counts,'{workflow_conditions}', to_jsonb(v_rc), true);

    delete from public.workflow_runs where org_id = p_org_id;
    get diagnostics v_rc = row_count;
    v_counts := jsonb_set(v_counts,'{workflow_runs}', to_jsonb(v_rc), true);

    delete from public.workflow_events where org_id = p_org_id;
    get diagnostics v_rc = row_count;
    v_counts := jsonb_set(v_counts,'{workflow_events}', to_jsonb(v_rc), true);

    delete from public.workflows where org_id = p_org_id;
    get diagnostics v_rc = row_count;
    v_counts := jsonb_set(v_counts,'{workflows}', to_jsonb(v_rc), true);
  end if;

  return jsonb_build_object(
    'ok', true,
    'org_id', p_org_id,
    'include_workflows', p_include_workflows,
    'deleted', v_counts
  );
end;
$$;


ALTER FUNCTION "admin"."wipe_org_data"("p_org_id" "uuid", "p_confirm" "text", "p_include_workflows" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_org_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    case
      when (select count(*) from public.orgs) = 1
        then (select id from public.orgs order by created_at asc limit 1)
      else null
    end;
$$;


ALTER FUNCTION "public"."current_org_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."discounted_cents"("base_cents" integer, "pct" numeric) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  cents int;
begin
  cents := round(base_cents * pct)::int;
  return public.round_to_nearest_5_cents(cents);
end;
$$;


ALTER FUNCTION "public"."discounted_cents"("base_cents" integer, "pct" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."ensure_vendor_primary_contact_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.primary_contact_id is not null then
    update public.contacts
    set vendor_id = new.id,
        vendor_contact_role = 'primary'
    where id = new.primary_contact_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."ensure_vendor_primary_contact_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."fn_job_split_bps"("p_job_number" integer) RETURNS TABLE("contractor_bps" integer, "alloy_bps" integer)
    LANGUAGE "plpgsql"
    AS $$
begin
  if p_job_number is null or p_job_number <= 1 then
    return query select 7000, 3000; -- job 1
  elsif p_job_number between 2 and 10 then
    return query select 8000, 2000; -- jobs 2-10
  else
    return query select 9000, 1000; -- job 11+
  end if;
end;
$$;


ALTER FUNCTION "public"."fn_job_split_bps"("p_job_number" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[] DEFAULT '{}'::"text"[]) RETURNS TABLE("out_vertical_slug" "text", "out_service_key" "text", "out_sqft_key" "text", "out_frequency_key" "text", "first_clean_cents" integer, "recurring_cents" integer, "addons_total_cents" integer, "total_first_visit_cents" integer, "price_breakdown" "text", "is_manual_quote" boolean)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
declare
  v_vertical_id uuid;
  v_service_id uuid;
  v_sqft_tier_id uuid;
  v_frequency_id uuid;
  v_first integer;
  v_recurring integer;
  v_addons integer;
  v_freq_label text;
  v_discount_label text;
begin
  -- Manual quote rule
  if lower(p_service_key) in ('move_out_heavy', 'move-out', 'move_out', 'heavy_clean', 'moveout') then
    out_vertical_slug := p_vertical_slug;
    out_service_key := p_service_key;
    out_sqft_key := p_sqft_key;
    out_frequency_key := p_frequency_key;
    first_clean_cents := null;
    recurring_cents := null;
    addons_total_cents := null;
    total_first_visit_cents := null;
    price_breakdown := 'Manual quote required';
    is_manual_quote := true;
    return next;
    return;
  end if;

  select id into v_vertical_id
  from public.verticals
  where slug = p_vertical_slug and is_active = true
  limit 1;

  if v_vertical_id is null then
    raise exception 'Unknown vertical slug: %', p_vertical_slug;
  end if;

  select ps.id into v_service_id
  from public.pricing_services ps
  where ps.vertical_id = v_vertical_id
    and ps.service_key = p_service_key
    and ps.is_active = true
  limit 1;

  if v_service_id is null then
    raise exception 'Unknown service_key for %: %', p_vertical_slug, p_service_key;
  end if;

  select st.id into v_sqft_tier_id
  from public.pricing_square_footage_tiers st
  where st.vertical_id = v_vertical_id
    and st.sqft_key = p_sqft_key
    and st.is_active = true
  limit 1;

  if v_sqft_tier_id is null then
    raise exception 'Unknown sqft_key for %: %', p_vertical_slug, p_sqft_key;
  end if;

  -- First clean price (service + sqft)
  select f.amount_cents into v_first
  from public.pricing_first_clean_prices f
  where f.vertical_id = v_vertical_id
    and f.service_id = v_service_id
    and f.sqft_tier_id = v_sqft_tier_id
    and f.is_active = true
  limit 1;

  if v_first is null then
    raise exception 'Missing first_clean price for % / % / %', p_vertical_slug, p_service_key, p_sqft_key;
  end if;

  -- Frequency (optional)
  v_recurring := null;
  v_freq_label := null;
  v_discount_label := null;

  if coalesce(trim(p_frequency_key), '') <> '' then
    select pf.id, pf.frequency_label, pf.discount_label
      into v_frequency_id, v_freq_label, v_discount_label
    from public.pricing_frequencies pf
    where pf.vertical_id = v_vertical_id
      and pf.frequency_key = p_frequency_key
      and pf.is_active = true
    limit 1;

    if v_frequency_id is not null then
      select r.amount_cents into v_recurring
      from public.pricing_recurring_prices r
      where r.vertical_id = v_vertical_id
        and r.frequency_id = v_frequency_id
        and r.sqft_tier_id = v_sqft_tier_id
        and r.is_active = true
      limit 1;
    end if;
  end if;

  -- Add-ons
  select coalesce(sum(pa.amount_cents), 0) into v_addons
  from public.pricing_addons pa
  where pa.vertical_id = v_vertical_id
    and pa.is_active = true
    and (coalesce(array_length(p_addon_keys, 1), 0) > 0 and pa.addon_key = any(p_addon_keys));

  out_vertical_slug := p_vertical_slug;
  out_service_key := p_service_key;
  out_sqft_key := p_sqft_key;
  out_frequency_key := p_frequency_key;

  first_clean_cents := v_first;
  recurring_cents := v_recurring;
  addons_total_cents := v_addons;
  total_first_visit_cents := v_first + v_addons;

  price_breakdown :=
    'Sq Ft: ' || p_sqft_key ||
    ' | Service: ' || p_service_key ||
    ' | First cleaning (base): $' || to_char(v_first/100.0, 'FM999990.00') ||
    case when v_addons > 0 then
      ' | Add-ons: $' || to_char(v_addons/100.0, 'FM999990.00')
    else '' end ||
    ' | First visit total: $' || to_char((v_first + v_addons)/100.0, 'FM999990.00') ||
    case when v_recurring is not null then
      ' | Recurring (' || coalesce(v_freq_label,'') || '): $' ||
      to_char(v_recurring/100.0, 'FM999990.00') || ' / visit' ||
      case when v_discount_label is not null then ' (' || v_discount_label || ')' else '' end
    else '' end;

  is_manual_quote := false;
  return next;
end $_$;


ALTER FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  insert into public.user_profiles (id, role)
  values (new.id, 'ops');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."has_org_role"("_org_id" "uuid", "_roles" "text"[]) RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.org_id = _org_id
      AND ur.role = ANY(_roles)
  );
$$;


ALTER FUNCTION "public"."has_org_role"("_org_id" "uuid", "_roles" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.app_users
    where id = auth.uid()
      and role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_org_member"("p_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.org_id = p_org_id
      and ur.user_id = auth.uid()
  );
$$;


ALTER FUNCTION "public"."is_org_member"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."locations_parent_same_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  parent_org uuid;
begin
  if new.parent_location_id is null then
    return new;
  end if;

  select org_id into parent_org
  from public.locations
  where id = new.parent_location_id;

  if parent_org is null then
    raise exception 'Parent location % not found', new.parent_location_id;
  end if;

  if parent_org <> new.org_id then
    raise exception 'Parent location org_id % does not match child org_id %', parent_org, new.org_id;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."locations_parent_same_org"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_tx public.ledger_transactions%rowtype;
  v_entry_id uuid;
  v_cash_acct uuid;
  v_clearing_acct uuid;
  v_ar_acct uuid;
  v_rev_acct uuid;
  v_contractor_payable_acct uuid;
  v_contractor_cogs_acct uuid;
  v_fees_acct uuid;
begin
  select * into v_tx
  from public.ledger_transactions
  where id = p_ledger_tx_id;

  if not found then
    raise exception 'ledger tx not found: %', p_ledger_tx_id;
  end if;

  -- idempotent: if already posted, return existing
  if v_tx.journal_entry_id is not null then
    return v_tx.journal_entry_id;
  end if;

  -- required mappings
  select gl_account_id into v_cash_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'cash' and is_active = true;

  select gl_account_id into v_clearing_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'stripe_clearing' and is_active = true;

  select gl_account_id into v_ar_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'accounts_receivable' and is_active = true;

  select gl_account_id into v_rev_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'revenue_gross' and is_active = true;

  select gl_account_id into v_contractor_payable_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'contractor_payable' and is_active = true;

  select gl_account_id into v_contractor_cogs_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'contractor_cogs' and is_active = true;

  select gl_account_id into v_fees_acct
  from public.gl_account_mappings
  where org_id = v_tx.org_id and key = 'processing_fees' and is_active = true;

  if v_cash_acct is null or v_clearing_acct is null or v_ar_acct is null or v_rev_acct is null then
    raise exception 'missing required GL mappings for org %', v_tx.org_id;
  end if;

  -- create journal entry (source = ledger tx)
  insert into public.gl_journal_entries (
    org_id, entry_date, description, status, posted_at, source_type, source_id, metadata
  ) values (
    v_tx.org_id,
    (v_tx.occurred_at at time zone 'utc')::date,
    coalesce(v_tx.metadata->>'description', v_tx.type),
    'posted',
    now(),
    'ledger_transaction',
    v_tx.id,
    jsonb_build_object('ledger_transaction_id', v_tx.id)
  )
  returning id into v_entry_id;

  -- Posting rules (GROSS DEFAULT)
  -- customer_charge (Stripe): Dr Stripe Clearing, Cr Revenue (Gross)
  if v_tx.type = 'customer_charge' then
    insert into public.gl_journal_lines
      (org_id, entry_id, line_no, account_id, debit_cents, credit_cents, currency, job_id, schedule_id, payment_id, customer_id, vendor_id, metadata)
    values
      (v_tx.org_id, v_entry_id, 1, v_clearing_acct, v_tx.amount_cents, 0, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb),
      (v_tx.org_id, v_entry_id, 2, v_rev_acct, 0, v_tx.amount_cents, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb);

  -- contractor_payout: Dr Contractor COGS, Cr Contractor Payable (or Cash if you pay immediately)
  elsif v_tx.type = 'contractor_payout' then
    if v_contractor_payable_acct is null or v_contractor_cogs_acct is null then
      raise exception 'missing contractor mappings (contractor_payable/contractor_cogs) for org %', v_tx.org_id;
    end if;

    insert into public.gl_journal_lines
      (org_id, entry_id, line_no, account_id, debit_cents, credit_cents, currency, job_id, schedule_id, payment_id, customer_id, vendor_id, metadata)
    values
      (v_tx.org_id, v_entry_id, 1, v_contractor_cogs_acct, v_tx.amount_cents, 0, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb),
      (v_tx.org_id, v_entry_id, 2, v_contractor_payable_acct, 0, v_tx.amount_cents, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb);

  -- processing_fee: Dr Processing Fees, Cr Stripe Clearing
  elsif v_tx.type = 'processing_fee' then
    if v_fees_acct is null then
      raise exception 'missing processing_fees mapping for org %', v_tx.org_id;
    end if;

    insert into public.gl_journal_lines
      (org_id, entry_id, line_no, account_id, debit_cents, credit_cents, currency, job_id, schedule_id, payment_id, customer_id, vendor_id, metadata)
    values
      (v_tx.org_id, v_entry_id, 1, v_fees_acct, v_tx.amount_cents, 0, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb),
      (v_tx.org_id, v_entry_id, 2, v_clearing_acct, 0, v_tx.amount_cents, v_tx.currency, v_tx.job_id, v_tx.schedule_id, v_tx.payment_id, v_tx.customer_id, v_tx.vendor_id, '{}'::jsonb);

  else
    raise exception 'unsupported ledger tx type: %', v_tx.type;
  end if;

  -- link ledger tx -> journal entry
  update public.ledger_transactions
  set journal_entry_id = v_entry_id
  where id = v_tx.id;

  return v_entry_id;
end;
$$;


ALTER FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- Minimal safe behavior: mark as posted so the trigger chain completes.
  update public.payments
  set posted_to_ledger_at = now()
  where id = payment_id
    and posted_to_ledger_at is null;
end;
$$;


ALTER FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") IS 'Called by trg_post_payment_to_ledger() after payments.paid_at updates. Minimal implementation sets payments.posted_to_ledger_at; extend to create ledger entries later.';



CREATE OR REPLACE FUNCTION "public"."prevent_completed_schedule_history_rewrite"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Only enforce for updates
  if (tg_op <> 'UPDATE') then
    return new;
  end if;

  -- If the OLD row is completed, block historical rewrites
  if (old.status_key = 'completed') then

    -- Block changing assigned_vendor_id
    if (new.assigned_vendor_id is distinct from old.assigned_vendor_id) then
      raise exception 'Cannot change assigned vendor for a completed schedule.';
    end if;

    -- Block changing job_id
    if (new.job_id is distinct from old.job_id) then
      raise exception 'Cannot change job for a completed schedule.';
    end if;

  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_completed_schedule_history_rewrite"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."round_to_nearest_5_cents"("p_cents" integer) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
begin
  return (round(p_cents / 500.0) * 500)::int;
end;
$$;


ALTER FUNCTION "public"."round_to_nearest_5_cents"("p_cents" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."scaled_base_cents"("old_dollars" numeric) RETURNS integer
    LANGUAGE "plpgsql"
    AS $$
declare
  scaled numeric;
  cents int;
begin
  scaled := old_dollars * (200.0 / 180.0);
  cents := (scaled * 100)::int;
  return public.round_to_nearest_5_cents(cents);
end;
$$;


ALTER FUNCTION "public"."scaled_base_cents"("old_dollars" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_default_rbac"("p_org_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- Permission catalog (add as we expand; start with what we enforce now)
  insert into public.permission_keys (key, label, group_key, description)
  values
    ('admin.users.read', 'View users', 'system', null),
    ('admin.users.write', 'Manage users', 'system', null),
    ('admin.roles.read', 'View roles & permissions', 'system', null),
    ('admin.roles.write', 'Manage roles & permissions', 'system', null),

    ('ops.customers.read', 'View customers', 'operations', null),
    ('ops.customers.write', 'Manage customers', 'operations', null),
    ('ops.contacts.read', 'View contacts', 'operations', null),
    ('ops.contacts.write', 'Manage contacts', 'operations', null),
    ('ops.opportunities.read', 'View opportunities', 'operations', null),
    ('ops.opportunities.write', 'Manage opportunities', 'operations', null),
    ('ops.jobs.read', 'View jobs', 'operations', null),
    ('ops.jobs.write', 'Manage jobs', 'operations', null),
    ('ops.schedules.read', 'View schedules', 'operations', null),
    ('ops.schedules.write', 'Manage schedules', 'operations', null),
    ('ops.locations.read', 'View locations', 'operations', null),
    ('ops.locations.write', 'Manage locations', 'operations', null),

    ('ops.workflows.read', 'View workflows', 'operations', null),
    ('ops.workflows.write', 'Manage workflows', 'operations', null),
    ('ops.messaging.read', 'View messaging/outbox', 'operations', null),
    ('ops.messaging.write', 'Send/manage messages', 'operations', null),

    ('fin.read', 'View financials', 'financials', null),
    ('fin.write', 'Manage financials', 'financials', null)
  on conflict (key) do nothing;

  -- Default roles for the org (matches your existing admin/ops reality)
  insert into public.role_definitions (org_id, role_key, role_label, description, is_system)
  values
    (p_org_id, 'admin', 'Admin', 'Full access', true),
    (p_org_id, 'ops', 'Operations', 'Operational access', true)
  on conflict (org_id, role_key) do nothing;

  -- Grants for admin: everything
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'admin', pk.key, true
  from public.permission_keys pk
  where pk.is_active = true
  on conflict (org_id, role_key, permission_key) do nothing;

  -- Grants for ops: no system user/role write
  insert into public.role_permission_grants (org_id, role_key, permission_key, allowed)
  select p_org_id, 'ops', pk.key, true
  from public.permission_keys pk
  where pk.is_active = true
    and pk.key not in ('admin.users.write','admin.roles.write')
  on conflict (org_id, role_key, permission_key) do nothing;

end$$;


ALTER FUNCTION "public"."seed_default_rbac"("p_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_person_full_name"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.full_name := nullif(trim(concat_ws(' ', new.first_name, new.last_name)), '');
  return new;
end;
$$;


ALTER FUNCTION "public"."set_person_full_name"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_jobs_assign_pricing_tier"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  v_completed_count integer;
  v_job_number integer;
  v_contractor_bps integer;
  v_alloy_bps integer;
  v_gross integer;
begin
  -- Require customer_id + vertical_id to compute tier
  if new.customer_id is null or new.vertical_id is null then
    return new;
  end if;

  -- Ensure a counter row exists
  insert into public.customer_vertical_job_counters (customer_id, vertical_id, completed_count)
  values (new.customer_id, new.vertical_id, 0)
  on conflict (customer_id, vertical_id) do nothing;

  select completed_count
    into v_completed_count
  from public.customer_vertical_job_counters
  where customer_id = new.customer_id
    and vertical_id = new.vertical_id;

  -- Job number is "next" based on completed count
  v_job_number := coalesce(v_completed_count, 0) + 1;

  -- Only set job_number if not provided explicitly
  if new.job_number_for_customer is null then
    new.job_number_for_customer := v_job_number;
  end if;

  -- Compute split from job_number
  select contractor_bps, alloy_bps
    into v_contractor_bps, v_alloy_bps
  from public.fn_job_split_bps(new.job_number_for_customer);

  new.contractor_split_bps := v_contractor_bps;
  new.alloy_split_bps := v_alloy_bps;

  -- Determine gross price for payout math:
  -- prefer gross_price_cents if provided, else fall back to estimated_total_cents.
  v_gross := coalesce(new.gross_price_cents, new.estimated_total_cents);

  if v_gross is not null then
    new.gross_price_cents := v_gross;

    -- Integer math (round down cents)
    new.contractor_payout_cents := (v_gross * v_contractor_bps) / 10000;
    new.alloy_fee_cents := v_gross - new.contractor_payout_cents;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_jobs_assign_pricing_tier"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_jobs_increment_completed_counter"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Only when completed_at transitions from null -> not null
  if (old.completed_at is null) and (new.completed_at is not null) then
    if new.customer_id is not null and new.vertical_id is not null then
      insert into public.customer_vertical_job_counters (customer_id, vertical_id, completed_count)
      values (new.customer_id, new.vertical_id, 1)
      on conflict (customer_id, vertical_id)
      do update set
        completed_count = public.customer_vertical_job_counters.completed_count + 1,
        updated_at = now();
    end if;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_jobs_increment_completed_counter"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_post_payment_to_ledger"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  -- Only when paid_at becomes non-null and not posted yet
  if (new.paid_at is not null)
     and (old.paid_at is distinct from new.paid_at)
     and (new.posted_to_ledger_at is null)
  then
    perform public.post_payment_to_ledger(new.id);
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."trg_post_payment_to_ledger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."user_belongs_to_org"("target_org_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.app_users au
    where au.id = auth.uid()
      and au.org_id = target_org_id
  );
$$;


ALTER FUNCTION "public"."user_belongs_to_org"("target_org_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."workflow_runs_set_org_id"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  if new.org_id is null then
    new.org_id := nullif(new.event_payload->>'org_id','')::uuid;
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."workflow_runs_set_org_id"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."access_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."access_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."action_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "action_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "token" "text" NOT NULL,
    "expires_at" timestamp with time zone DEFAULT ("now"() + '02:00:00'::interval),
    "consumed_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "short_code" "text"
);


ALTER TABLE "public"."action_links" OWNER TO "postgres";


COMMENT ON COLUMN "public"."action_links"."short_code" IS 'Short opaque code for SMS-friendly /a/{code} URLs; maps to token.';



CREATE TABLE IF NOT EXISTS "public"."activity_log" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "actor_type" "text",
    "actor_id" "uuid",
    "summary" "text",
    "diff" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."activity_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."addon_frequencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."addon_frequencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."addon_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "vertical_id" "uuid" NOT NULL
);


ALTER TABLE "public"."addon_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "vendor_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid",
    "auth_user_id" "uuid",
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['admin'::"text", 'ops'::"text", 'vendor_owner'::"text", 'vendor_worker'::"text"])))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."assignment_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "schedule_id" "uuid",
    "vendor_id" "uuid" NOT NULL,
    "vendor_user_id" "uuid",
    "assignment_status_id" "uuid",
    "offered_at" timestamp with time zone,
    "respond_by" timestamp with time zone,
    "accepted_at" timestamp with time zone,
    "assigned_worker_at" timestamp with time zone,
    "payout_percent" numeric,
    "payout_amount_cents" integer,
    "external_contractor_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "channel" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "starts_at" "date",
    "ends_at" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cleaning_job_addons" (
    "job_id" "uuid" NOT NULL,
    "addon_type_id" "uuid" NOT NULL
);


ALTER TABLE "public"."cleaning_job_addons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cleaning_job_details" (
    "job_id" "uuid" NOT NULL,
    "home_type_id" "uuid",
    "service_type_id" "uuid",
    "sqft_band_id" "uuid",
    "bedrooms" integer,
    "bathrooms" integer,
    "square_footage" integer,
    "addon_frequency_id" "uuid",
    "preferred_service_date" "date",
    "special_instructions" "text",
    "estimate_photos" "text",
    "access_method_id" "uuid",
    "access_notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);


ALTER TABLE "public"."cleaning_job_details" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cleaning_service_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."cleaning_service_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contact_tags" (
    "contact_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."contact_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "first_name" "text",
    "last_name" "text",
    "email" "text",
    "phone" "text",
    "company_name" "text",
    "website" "text",
    "timezone" "text",
    "date_of_birth" "date",
    "source" "text",
    "contact_type" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "address_line1" "text",
    "address_line2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "country" "text",
    "address_source" "text",
    "vendor_id" "uuid",
    "vendor_contact_role" "text",
    "archived_at" timestamp with time zone,
    "archived_by" "uuid",
    "status_key" "text",
    "person_id" "uuid"
);


ALTER TABLE "public"."contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_member_contact_roles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "role_label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."customer_member_contact_roles" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_member_contact_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_member_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "customer_member_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."customer_member_contacts" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_member_contacts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_member_relationship_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."customer_member_relationship_types" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_member_relationship_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_members" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "relationship" "text",
    "first_name" "text",
    "last_name" "text",
    "dob" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_source" "text",
    "external_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "status_key" "text",
    "person_id" "uuid"
);

ALTER TABLE ONLY "public"."customer_members" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_payment_methods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "stripe_payment_method_id" "text" NOT NULL,
    "brand" "text",
    "last4" "text",
    "is_default" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."customer_payment_methods" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_person_role_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vertical_id" "uuid",
    "industry_id" "uuid"
);


ALTER TABLE "public"."customer_person_role_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_persons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "role_type" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "status" "text",
    "start_date" "date",
    "end_date" "date",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."customer_persons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_subscriptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "primary_contact_id" "uuid",
    "vertical_id" "uuid",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "cadence" "text" NOT NULL,
    "interval" integer DEFAULT 1 NOT NULL,
    "preferred_weekdays" "text"[],
    "preferred_time_start" time without time zone,
    "preferred_time_end" time without time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_tags" (
    "customer_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_vertical_job_counters" (
    "customer_id" "uuid" NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "completed_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_vertical_job_counters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid",
    "name" "text" NOT NULL,
    "customer_type" "text",
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "stripe_customer_id" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "primary_contact_id" "uuid",
    "org_id" "uuid" NOT NULL,
    "default_payment_method_id" "text",
    "payment_method_last4" "text",
    "payment_method_brand" "text",
    "setup_intent_id" "text",
    "status_key" "text"
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "departments_key_nonempty" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "departments_name_nonempty" CHECK (("btrim"("name") <> ''::"text"))
);

ALTER TABLE ONLY "public"."departments" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" OWNER TO "postgres";


COMMENT ON TABLE "public"."departments" IS 'Tenant-scoped business function (Org → Department → Work unit → Record).';



CREATE TABLE IF NOT EXISTS "public"."discount_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "discount_program_id" "uuid" NOT NULL,
    "customer_id" "uuid",
    "opportunity_id" "uuid",
    "job_id" "uuid",
    "customer_subscription_id" "uuid",
    "discount_commitment_id" "uuid",
    "target_entity_type" "text" NOT NULL,
    "target_entity_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "source" "text" DEFAULT 'system'::"text" NOT NULL,
    "discount_amount_cents" integer NOT NULL,
    "currency_code" "text" DEFAULT 'USD'::"text" NOT NULL,
    "calculation_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "reversal_reason" "text",
    "applied_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legacy_discount_redemption_id" "uuid",
    "legacy_discount_code_id" "uuid",
    CONSTRAINT "discount_applications_discount_amount_cents_check" CHECK (("discount_amount_cents" >= 0)),
    CONSTRAINT "discount_applications_source_check" CHECK (("source" = ANY (ARRAY['system'::"text", 'admin'::"text", 'workflow'::"text", 'api'::"text", 'code'::"text", 'migration'::"text"]))),
    CONSTRAINT "discount_applications_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'applied'::"text", 'reversed'::"text", 'expired'::"text", 'void'::"text"]))),
    CONSTRAINT "discount_applications_target_entity_type_check" CHECK (("target_entity_type" = ANY (ARRAY['opportunity'::"text", 'job'::"text", 'customer_subscription'::"text", 'invoice'::"text", 'payment'::"text"])))
);


ALTER TABLE "public"."discount_applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_codes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric(10,2) NOT NULL,
    "applies_to_vertical_slug" "text",
    "first_job_only" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone,
    "ends_at" timestamp with time zone,
    "ghl_tag" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_codes_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percent'::"text", 'fixed'::"text"]))),
    CONSTRAINT "discount_codes_discount_value_check" CHECK (("discount_value" >= (0)::numeric))
);


ALTER TABLE "public"."discount_codes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_commitments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "discount_program_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "customer_subscription_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "required_service_count" integer NOT NULL,
    "completed_service_count" integer DEFAULT 0 NOT NULL,
    "window_start_at" timestamp with time zone NOT NULL,
    "window_end_at" timestamp with time zone NOT NULL,
    "breach_policy" "text" DEFAULT 'none'::"text" NOT NULL,
    "granted_discount_application_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_commitments_breach_policy_check" CHECK (("breach_policy" = ANY (ARRAY['none'::"text", 'charge_back'::"text", 'convert_to_credit'::"text", 'manual_review'::"text"]))),
    CONSTRAINT "discount_commitments_completed_service_count_check" CHECK (("completed_service_count" >= 0)),
    CONSTRAINT "discount_commitments_progress_chk" CHECK (("completed_service_count" <= "required_service_count")),
    CONSTRAINT "discount_commitments_required_service_count_check" CHECK (("required_service_count" > 0)),
    CONSTRAINT "discount_commitments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'fulfilled'::"text", 'breached'::"text", 'expired'::"text", 'canceled'::"text"]))),
    CONSTRAINT "discount_commitments_window_chk" CHECK (("window_end_at" >= "window_start_at"))
);


ALTER TABLE "public"."discount_commitments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_program_benefits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "discount_program_id" "uuid" NOT NULL,
    "benefit_type" "text" NOT NULL,
    "applies_to" "text" DEFAULT 'order'::"text" NOT NULL,
    "service_index" integer,
    "amount_cents" integer,
    "percent_basis_points" integer,
    "max_discount_cents" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_program_benefits_amount_cents_check" CHECK ((("amount_cents" IS NULL) OR ("amount_cents" >= 0))),
    CONSTRAINT "discount_program_benefits_applies_to_check" CHECK (("applies_to" = ANY (ARRAY['order'::"text", 'service'::"text", 'first_service'::"text", 'nth_service'::"text", 'addon'::"text"]))),
    CONSTRAINT "discount_program_benefits_benefit_type_check" CHECK (("benefit_type" = ANY (ARRAY['percent_off'::"text", 'fixed_amount_off'::"text", 'free_service'::"text", 'free_addon'::"text", 'override_price'::"text", 'credit'::"text"]))),
    CONSTRAINT "discount_program_benefits_max_discount_cents_check" CHECK ((("max_discount_cents" IS NULL) OR ("max_discount_cents" >= 0))),
    CONSTRAINT "discount_program_benefits_percent_basis_points_check" CHECK ((("percent_basis_points" IS NULL) OR (("percent_basis_points" >= 0) AND ("percent_basis_points" <= 10000)))),
    CONSTRAINT "discount_program_benefits_service_index_check" CHECK ((("service_index" IS NULL) OR ("service_index" > 0))),
    CONSTRAINT "discount_program_benefits_value_present_chk" CHECK ((("amount_cents" IS NOT NULL) OR ("percent_basis_points" IS NOT NULL) OR ("benefit_type" = ANY (ARRAY['free_service'::"text", 'free_addon'::"text"]))))
);


ALTER TABLE "public"."discount_program_benefits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_program_commitment_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "discount_program_id" "uuid" NOT NULL,
    "enrollment_mode" "text" DEFAULT 'automatic'::"text" NOT NULL,
    "commitment_start_mode" "text" DEFAULT 'first_service_completed'::"text" NOT NULL,
    "benefit_grant_timing" "text" DEFAULT 'upfront'::"text" NOT NULL,
    "required_service_count" integer NOT NULL,
    "timeframe_days" integer NOT NULL,
    "qualifying_service_status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "breach_policy" "text" DEFAULT 'manual_review'::"text" NOT NULL,
    "max_redemptions_per_customer" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "discount_program_commitment__max_redemptions_per_customer_check" CHECK ((("max_redemptions_per_customer" IS NULL) OR ("max_redemptions_per_customer" > 0))),
    CONSTRAINT "discount_program_commitment_rul_qualifying_service_status_check" CHECK (("qualifying_service_status" = ANY (ARRAY['booked'::"text", 'completed'::"text"]))),
    CONSTRAINT "discount_program_commitment_rules_benefit_grant_timing_check" CHECK (("benefit_grant_timing" = ANY (ARRAY['upfront'::"text", 'after_fulfillment'::"text"]))),
    CONSTRAINT "discount_program_commitment_rules_breach_policy_check" CHECK (("breach_policy" = ANY (ARRAY['none'::"text", 'charge_back'::"text", 'convert_to_credit'::"text", 'manual_review'::"text"]))),
    CONSTRAINT "discount_program_commitment_rules_commitment_start_mode_check" CHECK (("commitment_start_mode" = ANY (ARRAY['first_service_booked'::"text", 'first_service_completed'::"text", 'program_applied'::"text"]))),
    CONSTRAINT "discount_program_commitment_rules_enrollment_mode_check" CHECK (("enrollment_mode" = ANY (ARRAY['automatic'::"text", 'manual'::"text"]))),
    CONSTRAINT "discount_program_commitment_rules_required_service_count_check" CHECK (("required_service_count" > 0)),
    CONSTRAINT "discount_program_commitment_rules_timeframe_days_check" CHECK (("timeframe_days" > 0))
);


ALTER TABLE "public"."discount_program_commitment_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_program_qualifiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "discount_program_id" "uuid" NOT NULL,
    "qualifier_type" "text" NOT NULL,
    "operator" "text" DEFAULT 'eq'::"text" NOT NULL,
    "value_json" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."discount_program_qualifiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_programs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "description" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "program_type" "text" DEFAULT 'code'::"text" NOT NULL,
    "stacking_mode" "text" DEFAULT 'exclusive'::"text" NOT NULL,
    "priority" integer DEFAULT 100 NOT NULL,
    "valid_from" timestamp with time zone,
    "valid_to" timestamp with time zone,
    "max_total_uses" integer,
    "max_uses_per_customer" integer,
    "first_time_customer_only" boolean DEFAULT false NOT NULL,
    "auto_apply" boolean DEFAULT false NOT NULL,
    "applies_to_entity_type" "text" DEFAULT 'job'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "legacy_discount_code_id" "uuid",
    CONSTRAINT "discount_programs_applies_to_entity_type_check" CHECK (("applies_to_entity_type" = ANY (ARRAY['opportunity'::"text", 'job'::"text", 'customer_subscription'::"text", 'invoice'::"text", 'payment'::"text"]))),
    CONSTRAINT "discount_programs_max_total_uses_check" CHECK ((("max_total_uses" IS NULL) OR ("max_total_uses" >= 0))),
    CONSTRAINT "discount_programs_max_uses_per_customer_check" CHECK ((("max_uses_per_customer" IS NULL) OR ("max_uses_per_customer" >= 0))),
    CONSTRAINT "discount_programs_program_type_check" CHECK (("program_type" = ANY (ARRAY['code'::"text", 'auto'::"text", 'commitment'::"text", 'subscription'::"text", 'retention'::"text", 'referral'::"text"]))),
    CONSTRAINT "discount_programs_stacking_mode_check" CHECK (("stacking_mode" = ANY (ARRAY['exclusive'::"text", 'stackable'::"text", 'best_of'::"text"]))),
    CONSTRAINT "discount_programs_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'archived'::"text"]))),
    CONSTRAINT "discount_programs_valid_window_chk" CHECK ((("valid_to" IS NULL) OR ("valid_from" IS NULL) OR ("valid_to" >= "valid_from")))
);


ALTER TABLE "public"."discount_programs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."discount_programs_admin_v" WITH ("security_invoker"='true') AS
 SELECT "dp"."id",
    "dp"."org_id",
    "dp"."name",
    "dp"."code",
    "dp"."description",
    "dp"."status",
    "dp"."program_type",
    "dp"."stacking_mode",
    "dp"."priority",
    "dp"."valid_from",
    "dp"."valid_to",
    "dp"."first_time_customer_only",
    "dp"."auto_apply",
    "dp"."applies_to_entity_type",
    "dp"."legacy_discount_code_id",
    ("dp"."legacy_discount_code_id" IS NOT NULL) AS "is_legacy_migrated",
    "dp"."metadata",
    "dp"."created_at",
    "dp"."updated_at",
    "b"."id" AS "primary_benefit_id",
    "b"."benefit_type" AS "primary_benefit_type",
    "b"."applies_to" AS "primary_benefit_applies_to",
    "b"."service_index" AS "primary_benefit_service_index",
    "b"."amount_cents" AS "primary_benefit_amount_cents",
    "b"."percent_basis_points" AS "primary_benefit_percent_basis_points",
    "b"."max_discount_cents" AS "primary_benefit_max_discount_cents",
    "r"."id" AS "commitment_rule_id",
    "r"."enrollment_mode",
    "r"."commitment_start_mode",
    "r"."benefit_grant_timing",
    "r"."required_service_count",
    "r"."timeframe_days",
    "r"."qualifying_service_status",
    "r"."breach_policy",
    "r"."max_redemptions_per_customer",
    COALESCE("q"."qualifiers", '[]'::"jsonb") AS "qualifiers",
    COALESCE("bb"."benefits", '[]'::"jsonb") AS "benefits"
   FROM (((("public"."discount_programs" "dp"
     LEFT JOIN LATERAL ( SELECT "x"."id",
            "x"."benefit_type",
            "x"."applies_to",
            "x"."service_index",
            "x"."amount_cents",
            "x"."percent_basis_points",
            "x"."max_discount_cents"
           FROM "public"."discount_program_benefits" "x"
          WHERE ("x"."discount_program_id" = "dp"."id")
          ORDER BY "x"."created_at", "x"."id"
         LIMIT 1) "b" ON (true))
     LEFT JOIN "public"."discount_program_commitment_rules" "r" ON (("r"."discount_program_id" = "dp"."id")))
     LEFT JOIN LATERAL ( SELECT "jsonb_agg"("jsonb_build_object"('id', "x"."id", 'qualifier_type', "x"."qualifier_type", 'operator', "x"."operator", 'value_json', "x"."value_json", 'sort_order', "x"."sort_order", 'metadata', "x"."metadata") ORDER BY "x"."sort_order", "x"."created_at", "x"."id") AS "qualifiers"
           FROM "public"."discount_program_qualifiers" "x"
          WHERE ("x"."discount_program_id" = "dp"."id")) "q" ON (true))
     LEFT JOIN LATERAL ( SELECT "jsonb_agg"("jsonb_build_object"('id', "x"."id", 'benefit_type', "x"."benefit_type", 'applies_to', "x"."applies_to", 'service_index', "x"."service_index", 'amount_cents', "x"."amount_cents", 'percent_basis_points', "x"."percent_basis_points", 'max_discount_cents', "x"."max_discount_cents", 'metadata', "x"."metadata") ORDER BY "x"."created_at", "x"."id") AS "benefits"
           FROM "public"."discount_program_benefits" "x"
          WHERE ("x"."discount_program_id" = "dp"."id")) "bb" ON (true));


ALTER VIEW "public"."discount_programs_admin_v" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discount_redemptions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "discount_code_id" "uuid",
    "discount_code" "text" NOT NULL,
    "contact_id" "uuid",
    "opportunity_id" "uuid",
    "job_id" "uuid",
    "quote_subtotal" numeric(10,2),
    "discount_amount" numeric(10,2),
    "quote_total" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "customer_id" "uuid",
    "booking_attempt_id" "uuid",
    "discount_program_id" "uuid"
);


ALTER TABLE "public"."discount_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."discounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid",
    "code" "text" NOT NULL,
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "max_uses" integer,
    "uses_count" integer DEFAULT 0 NOT NULL,
    "starts_at" "date",
    "ends_at" "date",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."discounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_field_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "doc_type" "text" NOT NULL,
    "field_key" "text" NOT NULL,
    "field_label" "text" NOT NULL,
    "field_type" "text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "is_ai_extractable" boolean DEFAULT false NOT NULL,
    "extraction_hint" "text",
    "sort_order" integer,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."document_field_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_field_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "field_definition_id" "uuid",
    "field_key" "text" NOT NULL,
    "value_text" "text",
    "value_number" numeric,
    "value_boolean" boolean,
    "value_date" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."document_field_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."document_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "document_id" "uuid" NOT NULL,
    "version_number" integer NOT NULL,
    "storage_path" "text",
    "original_filename" "text",
    "mime_type" "text",
    "byte_size" bigint,
    "checksum_sha256" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."document_versions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "owner_contact_id" "uuid",
    "entity_type" "text",
    "entity_id" "uuid",
    "doc_type" "text",
    "title" "text",
    "original_filename" "text",
    "mime_type" "text",
    "byte_size" bigint,
    "bucket" "text",
    "storage_path" "text",
    "public_url" "text",
    "checksum_sha256" "text",
    "status" "text" DEFAULT 'uploaded'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "extracted_text" "text",
    "extracted_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "extraction_status" "text",
    "extraction_provider" "text",
    "extraction_error" "text",
    "extracted_at" timestamp with time zone,
    "generated_from_document_id" "uuid",
    "template_key" "text"
);


ALTER TABLE "public"."documents" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."entity_labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "singular" "text" NOT NULL,
    "plural" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."entity_labels" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."entity_labels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."external_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "external_id" "text" NOT NULL,
    "internal_table" "text" NOT NULL,
    "internal_id" "uuid" NOT NULL,
    "last_synced_at" timestamp with time zone,
    "sync_hash" "text",
    "raw" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."external_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "field_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "field_type" "text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_visible_in_form" boolean DEFAULT true NOT NULL,
    "is_visible_in_drawer" boolean DEFAULT true NOT NULL,
    "is_visible_in_table" boolean DEFAULT false NOT NULL,
    "is_filterable" boolean DEFAULT false NOT NULL,
    "is_sortable" boolean DEFAULT false NOT NULL,
    "section_key" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "placeholder" "text",
    "help_text" "text",
    "config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."field_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."field_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "field_definition_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "value_text" "text",
    "value_number" numeric,
    "value_boolean" boolean,
    "value_date" "date",
    "value_json" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."field_values" OWNER TO "postgres";


COMMENT ON TABLE "public"."field_values" IS 'Values for custom (non-system) fields per entity. System fields are on entity tables (e.g. persons).';



CREATE TABLE IF NOT EXISTS "public"."gl_account_mappings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "gl_account_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."gl_account_mappings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gl_accounts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "gl_accounts_type_check" CHECK (("type" = ANY (ARRAY['asset'::"text", 'liability'::"text", 'equity'::"text", 'revenue'::"text", 'expense'::"text"])))
);


ALTER TABLE "public"."gl_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gl_journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entry_date" "date" DEFAULT (("now"() AT TIME ZONE 'utc'::"text"))::"date" NOT NULL,
    "description" "text",
    "status" "text" DEFAULT 'posted'::"text" NOT NULL,
    "posted_at" timestamp with time zone DEFAULT "now"(),
    "source_type" "text",
    "source_id" "uuid",
    "reversal_of_entry_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "gl_journal_entries_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'posted'::"text", 'void'::"text"])))
);


ALTER TABLE "public"."gl_journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gl_journal_lines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "entry_id" "uuid" NOT NULL,
    "line_no" integer DEFAULT 1 NOT NULL,
    "account_id" "uuid" NOT NULL,
    "description" "text",
    "debit_cents" bigint DEFAULT 0 NOT NULL,
    "credit_cents" bigint DEFAULT 0 NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "job_id" "uuid",
    "schedule_id" "uuid",
    "payment_id" "uuid",
    "customer_id" "uuid",
    "vendor_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "gl_journal_lines_credit_nonneg" CHECK (("credit_cents" >= 0)),
    CONSTRAINT "gl_journal_lines_debit_credit_chk" CHECK ((("debit_cents" >= 0) AND ("credit_cents" >= 0) AND (NOT (("debit_cents" > 0) AND ("credit_cents" > 0))) AND (NOT (("debit_cents" = 0) AND ("credit_cents" = 0))))),
    CONSTRAINT "gl_journal_lines_debit_nonneg" CHECK (("debit_cents" >= 0)),
    CONSTRAINT "gl_journal_lines_one_sided" CHECK (((("debit_cents" > 0) AND ("credit_cents" = 0)) OR (("credit_cents" > 0) AND ("debit_cents" = 0))))
);


ALTER TABLE "public"."gl_journal_lines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."home_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."home_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."industries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."industries" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."industries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."industry_default_entity_labels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "industry_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "singular" "text" NOT NULL,
    "plural" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."industry_default_entity_labels" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."industry_default_entity_labels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."job_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."job_tags" (
    "job_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."job_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid",
    "customer_id" "uuid" NOT NULL,
    "primary_contact_id" "uuid",
    "location_id" "uuid",
    "opportunity_id" "uuid",
    "title" "text",
    "is_recurring" boolean DEFAULT false NOT NULL,
    "job_status_id" "uuid" DEFAULT '6c699cac-8981-4200-93f0-2bf166cff36c'::"uuid",
    "service_frequency_key" "text",
    "estimated_total_cents" integer,
    "recurring_total_cents" integer,
    "offer_code" "text",
    "offer_expires_at" timestamp with time zone,
    "internal_notes" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "description" "text",
    "job_number_for_customer" integer,
    "contractor_split_bps" integer,
    "alloy_split_bps" integer,
    "gross_price_cents" integer,
    "contractor_payout_cents" integer,
    "alloy_fee_cents" integer,
    "scheduled_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "service_key" "text",
    "job_type" "text",
    "discount_code_id" "uuid",
    "discount_code" "text",
    "discount_amount" numeric(10,2),
    "discounted" boolean DEFAULT false NOT NULL,
    "assigned_vendor_id" "uuid",
    "archived_at" timestamp with time zone,
    "status_key" "text",
    "primary_person_id" "uuid",
    "discount_program_id" "uuid",
    "work_unit_id" "uuid",
    CONSTRAINT "chk_jobs_amounts_nonnegative" CHECK (((("estimated_total_cents" IS NULL) OR ("estimated_total_cents" >= 0)) AND (("recurring_total_cents" IS NULL) OR ("recurring_total_cents" >= 0))))
);


ALTER TABLE "public"."jobs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."jobs"."work_unit_id" IS 'Optional work unit for routing/UI V2; null = unassigned to a work unit.';



CREATE TABLE IF NOT EXISTS "public"."ledger_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "type" "text" NOT NULL,
    "direction" "text" NOT NULL,
    "amount_cents" bigint NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "provider" "text",
    "provider_ref" "text",
    "job_id" "uuid",
    "schedule_id" "uuid",
    "payment_id" "uuid",
    "customer_id" "uuid",
    "vendor_id" "uuid",
    "journal_entry_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ledger_transactions_amount_cents_check" CHECK (("amount_cents" >= 0)),
    CONSTRAINT "ledger_transactions_direction_chk" CHECK (("direction" = ANY (ARRAY['in'::"text", 'out'::"text"]))),
    CONSTRAINT "ledger_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'confirmed'::"text", 'failed'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."ledger_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_tags" (
    "location_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."location_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."location_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."location_types" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "label" "text",
    "is_primary" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "address1" "text",
    "address2" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "country" "text",
    "lat" numeric,
    "lng" numeric,
    "access_method_id" "uuid",
    "access_notes" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "vendor_id" "uuid",
    "location_type" "text" DEFAULT 'address'::"text" NOT NULL,
    "parent_location_id" "uuid",
    "location_type_id" "uuid",
    "status_key" "text",
    "access_code" "text",
    "has_pets" boolean,
    CONSTRAINT "locations_location_type_check" CHECK (("location_type" = ANY (ARRAY['address'::"text", 'site'::"text", 'unit'::"text"]))),
    CONSTRAINT "locations_owner_xor_check" CHECK ((NOT (("customer_id" IS NOT NULL) AND ("vendor_id" IS NOT NULL))))
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


COMMENT ON COLUMN "public"."locations"."access_code" IS 'Door/gate code when customer selects code-based access; optional.';



COMMENT ON COLUMN "public"."locations"."has_pets" IS 'Whether pets are present at the service address.';



CREATE TABLE IF NOT EXISTS "public"."messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid",
    "contact_id" "uuid",
    "job_id" "uuid",
    "opportunity_id" "uuid",
    "channel" "text",
    "direction" "text",
    "from_value" "text",
    "to_value" "text",
    "body" "text",
    "status" "text" DEFAULT 'queued'::"text",
    "sent_at" timestamp with time zone,
    "provider" "text",
    "provider_message_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "related_entity_type" "text",
    "related_entity_id" "uuid",
    "workflow_run_id" "uuid",
    "error" "text",
    "external_id" "text"
);


ALTER TABLE "public"."messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."messages_outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "workflow_run_id" "uuid",
    "workflow_id" "uuid",
    "channel" "text" DEFAULT 'sms'::"text" NOT NULL,
    "to_number" "text",
    "to_email" "text",
    "template_key" "text",
    "body" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'queued'::"text" NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sent_at" timestamp with time zone,
    "dedupe_key" "text",
    "to_contact_id" "uuid",
    "to_phone" "text"
);

ALTER TABLE ONLY "public"."messages_outbox" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages_outbox" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunities" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid",
    "customer_id" "uuid",
    "primary_contact_id" "uuid",
    "location_id" "uuid",
    "name" "text",
    "pipeline_id" "uuid",
    "pipeline_stage_id" "uuid",
    "status" "text",
    "source" "text",
    "lost_reason" "text",
    "assigned_to" "text",
    "job_date" "date",
    "job_time_window" "text",
    "appointment_id" "text",
    "customer_notes" "text",
    "monetary_value_cents" integer,
    "estimated_price_cents" integer,
    "recurring_price_cents" integer,
    "price_breakdown" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "title" "text",
    "org_id" "uuid",
    "discount_code_id" "uuid",
    "discount_code" "text",
    "quote_subtotal" numeric(10,2),
    "discount_amount" numeric(10,2),
    "quote_total" numeric(10,2),
    "discount_validated_at" timestamp with time zone,
    "status_key" "text",
    "primary_person_id" "uuid",
    "discount_program_id" "uuid"
);


ALTER TABLE "public"."opportunities" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."opportunity_tags" (
    "opportunity_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."opportunity_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."org_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "payout_type" "text" DEFAULT 'percentage'::"text" NOT NULL,
    "payout_value" numeric DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "org_settings_payout_type_check" CHECK (("payout_type" = ANY (ARRAY['percentage'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."org_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orgs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "industry_id" "uuid"
);


ALTER TABLE "public"."orgs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."payment_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "payment_status_id" "uuid",
    "provider" "text",
    "provider_payment_id" "text",
    "paid_at" timestamp with time zone,
    "notes" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "posted_to_ledger_at" timestamp with time zone,
    "status_key" "text",
    CONSTRAINT "chk_payments_amount_nonnegative" CHECK (("amount_cents" >= 0))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permission_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "group_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."permission_definitions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permission_keys" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "group_key" "text" DEFAULT 'general'::"text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."permission_keys" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "key" "text" NOT NULL,
    "group_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."permissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."permissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "person_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "relationship_type" "text" DEFAULT 'associated'::"text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."person_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_relationship_type_settings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "vertical_id" "uuid",
    "industry_id" "uuid"
);


ALTER TABLE "public"."person_relationship_type_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."person_relationships" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "from_person_id" "uuid" NOT NULL,
    "to_person_id" "uuid" NOT NULL,
    "relationship_type" "text" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "status" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "ck_person_relationships_not_same" CHECK (("from_person_id" <> "to_person_id"))
);


ALTER TABLE "public"."person_relationships" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."persons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "full_name" "text",
    "preferred_name" "text",
    "email" "text",
    "phone" "text",
    "date_of_birth" "date",
    "status" "text",
    "status_key" "text",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "archived_at" timestamp with time zone,
    "archived_by" "uuid"
);


ALTER TABLE "public"."persons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipeline_stages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pipeline_id" "uuid" NOT NULL,
    "ghl_stage_uuid" "uuid",
    "name" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "show_in_funnel" boolean DEFAULT true NOT NULL,
    "show_in_pie_chart" boolean DEFAULT true NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."pipeline_stages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pipelines" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "ghl_pipeline_id" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."pipelines" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_addons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "addon_key" "text" NOT NULL,
    "addon_name" "text" NOT NULL,
    "amount_cents" integer NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."pricing_addons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_dimension_values" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dimension_id" "uuid",
    "value_key" "text" NOT NULL,
    "value_label" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pricing_dimension_values" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_dimensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid",
    "dimension_key" "text" NOT NULL,
    "dimension_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pricing_dimensions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_first_clean_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "sqft_tier_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "service_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pricing_first_clean_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_frequencies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "frequency_key" "text" NOT NULL,
    "frequency_label" "text" NOT NULL,
    "discount_label" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_recurring" boolean DEFAULT true NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "recurrence_unit" "text",
    "recurrence_interval" integer,
    "service_plan_template_id" "uuid"
);


ALTER TABLE "public"."pricing_frequencies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_matrix" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "service_offering_id" "uuid",
    "service_plan_template_id" "uuid",
    "pricing_mode_id" "uuid" NOT NULL,
    "pricing_dimension_value_id" "uuid",
    "amount_cents" integer NOT NULL,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "effective_start_at" timestamp with time zone,
    "effective_end_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "source_table" "text",
    "source_id" "uuid"
);


ALTER TABLE "public"."pricing_matrix" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_modes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid",
    "mode_key" "text" NOT NULL,
    "mode_name" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pricing_modes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_recurring_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "frequency_id" "uuid" NOT NULL,
    "sqft_tier_id" "uuid" NOT NULL,
    "amount_cents" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "service_id" "uuid" NOT NULL
);


ALTER TABLE "public"."pricing_recurring_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "service_key" "text" NOT NULL,
    "service_name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "is_manual_quote" boolean DEFAULT false NOT NULL,
    "service_offering_id" "uuid"
);


ALTER TABLE "public"."pricing_services" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pricing_square_footage_tiers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "sqft_key" "text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "sqft_label" "text",
    "dimension_value_id" "uuid"
);


ALTER TABLE "public"."pricing_square_footage_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."quotes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "opportunity_id" "uuid",
    "job_id" "uuid",
    "pricing_version" integer DEFAULT 1 NOT NULL,
    "subtotal_cents" integer,
    "discount_cents" integer DEFAULT 0 NOT NULL,
    "tax_cents" integer DEFAULT 0 NOT NULL,
    "total_cents" integer,
    "recurring_total_cents" integer,
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "price_breakdown" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "expires_at" timestamp with time zone,
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid",
    CONSTRAINT "chk_quotes_amounts_nonnegative" CHECK (((("subtotal_cents" IS NULL) OR ("subtotal_cents" >= 0)) AND ("discount_cents" >= 0) AND ("tax_cents" >= 0) AND (("total_cents" IS NULL) OR ("total_cents" >= 0)) AND (("recurring_total_cents" IS NULL) OR ("recurring_total_cents" >= 0))))
);


ALTER TABLE "public"."quotes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recurrence_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "frequency_key" "text" NOT NULL,
    "interval" integer DEFAULT 1 NOT NULL,
    "day_of_week" integer,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "next_run_at" timestamp with time zone,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."recurrence_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "role_label" "text" NOT NULL,
    "description" "text",
    "is_system" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."role_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."role_permission_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "role_key" "text" NOT NULL,
    "permission_key" "text" NOT NULL,
    "allowed" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);

ALTER TABLE ONLY "public"."role_permission_grants" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_permission_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."schedule_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedule_tags" (
    "schedule_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."schedule_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "visit_type" "text",
    "start_at" timestamp with time zone,
    "end_at" timestamp with time zone,
    "duration_minutes" integer,
    "timezone" "text",
    "schedule_status_id" "uuid",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "customer_subscription_id" "uuid",
    "subscription_sequence" integer,
    "canceled_at" timestamp with time zone,
    "canceled_by" "text",
    "cancel_reason" "text",
    "rescheduled_from_schedule_id" "uuid",
    "reschedule_reason" "text",
    "location_id" "uuid",
    "status_key" "text",
    "assigned_vendor_id" "uuid",
    "price_cents" integer
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_offerings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vertical_id" "uuid",
    "offering_key" "text" NOT NULL,
    "offering_name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."service_offerings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_plan_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vertical_id" "uuid",
    "plan_key" "text" NOT NULL,
    "plan_name" "text" NOT NULL,
    "is_recurring" boolean DEFAULT false NOT NULL,
    "recurrence_unit" "text",
    "recurrence_interval" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."service_plan_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_price_dimensions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pricing_rule_id" "uuid" NOT NULL,
    "dimension_type" "text" NOT NULL,
    "dimension_key" "text" NOT NULL,
    "dimension_label" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."service_price_dimensions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."service_pricing_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "vertical_id" "uuid",
    "service_offering_id" "uuid" NOT NULL,
    "service_plan_template_id" "uuid",
    "pricing_model" "text" DEFAULT 'flat'::"text" NOT NULL,
    "base_price" numeric(12,2),
    "currency" "text" DEFAULT 'USD'::"text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "effective_start_at" timestamp with time zone,
    "effective_end_at" timestamp with time zone,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."service_pricing_rules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sqft_bands" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."sqft_bands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."status_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid",
    "entity_type" "text" NOT NULL,
    "status_key" "text" NOT NULL,
    "status_label" "text" NOT NULL,
    "sort_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "industry_key" "text",
    "is_default" boolean DEFAULT false NOT NULL
);

ALTER TABLE ONLY "public"."status_definitions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_definitions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tags" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_profiles" (
    "id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'ops'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_roles" (
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."user_roles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_statuses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."vendor_statuses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_tags" (
    "vendor_id" "uuid" NOT NULL,
    "tag_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vendor_tags" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_users" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "vendor_id" "uuid" NOT NULL,
    "contact_id" "uuid" NOT NULL,
    "role" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "availability_days" "text"[],
    "availability_timeblocks" "text"[],
    "drivers_license_file_id" "uuid",
    "agreements" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid"
);


ALTER TABLE "public"."vendor_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendor_verticals" (
    "vendor_id" "uuid" NOT NULL,
    "vertical_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."vendor_verticals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."vendors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "email" "text",
    "phone" "text",
    "payout_percent" numeric DEFAULT 0.70 NOT NULL,
    "max_daily_jobs" integer,
    "insurance_doc_file_id" "uuid",
    "w9_received" boolean DEFAULT false NOT NULL,
    "ach_verified" boolean DEFAULT false NOT NULL,
    "primary_contact_id" "uuid",
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "org_id" "uuid" NOT NULL,
    "service_area_zip_codes" "text"[],
    "owns_supplies" boolean,
    "days_available" "text"[],
    "operating_hours_open" time without time zone,
    "operating_hours_close" time without time zone,
    "address_line1" "text",
    "city" "text",
    "state" "text",
    "postal_code" "text",
    "drivers_license_doc_file_id" "uuid",
    "consent_contractor_agreement" boolean DEFAULT false NOT NULL,
    "consent_marketing" boolean DEFAULT false NOT NULL,
    "consent_legal" boolean DEFAULT false NOT NULL,
    "submitted_at" timestamp with time zone,
    "vendor_status_id" "uuid" NOT NULL,
    "company_name" "text",
    "insurance_doc_path" "text",
    "drivers_license_doc_path" "text",
    "status_key" "text",
    "payout_override_type" "text",
    "payout_override_value" numeric,
    "primary_person_id" "uuid",
    CONSTRAINT "chk_vendors_operating_hours" CHECK ((("operating_hours_open" IS NULL) OR ("operating_hours_close" IS NULL) OR ("operating_hours_open" < "operating_hours_close"))),
    CONSTRAINT "chk_vendors_payout_percent" CHECK ((("payout_percent" >= (0)::numeric) AND ("payout_percent" <= (1)::numeric))),
    CONSTRAINT "vendors_payout_override_type_check" CHECK (("payout_override_type" = ANY (ARRAY['percentage'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."vendors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."verticals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "external_source" "text",
    "external_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."verticals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."work_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "department_id" "uuid" NOT NULL,
    "key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "queue_definition" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    CONSTRAINT "work_units_key_nonempty" CHECK (("btrim"("key") <> ''::"text")),
    CONSTRAINT "work_units_name_nonempty" CHECK (("btrim"("name") <> ''::"text"))
);

ALTER TABLE ONLY "public"."work_units" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_units" OWNER TO "postgres";


COMMENT ON TABLE "public"."work_units" IS 'Operational queue/cohort within a department; optional JSON queue_definition for future filter DSL.';



COMMENT ON COLUMN "public"."work_units"."org_id" IS 'Denormalized from department.org_id for RLS and admin queries; must match parent department.org_id (enforced on write via RLS WITH CHECK).';



COMMENT ON COLUMN "public"."work_units"."queue_definition" IS 'Structured queue/filter config; semantics defined by app (v1: often {}).';



CREATE TABLE IF NOT EXISTS "public"."workflow_action_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "workflow_run_id" "uuid" NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "action_id" "uuid",
    "action_order" integer,
    "action_type" "text",
    "status" "text" DEFAULT 'started'::"text" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "inputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "outputs" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "meta" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL
);

ALTER TABLE ONLY "public"."workflow_action_runs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_action_runs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "action_order" integer NOT NULL,
    "action_type" "text" NOT NULL,
    "target_entity" "text",
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid",
    CONSTRAINT "workflow_actions_target_entity_required_for_update" CHECK (((("action_type" = 'update_entity'::"text") AND ("target_entity" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "target_entity")) > 0)) OR ("action_type" <> 'update_entity'::"text")))
);


ALTER TABLE "public"."workflow_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_conditions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "field" "text" NOT NULL,
    "operator" "text" NOT NULL,
    "value" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid"
);


ALTER TABLE "public"."workflow_conditions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "org_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "action_type" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "occurred_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE ONLY "public"."workflow_events" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflow_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "event_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "org_id" "uuid"
);

ALTER TABLE ONLY "public"."workflow_runs" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_runs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."workflow_run_events" WITH ("security_invoker"='true') AS
 SELECT "r"."id" AS "run_id",
    "r"."workflow_id",
    "r"."status",
    "r"."error",
    "r"."started_at",
    "r"."completed_at",
    "r"."org_id" AS "run_org_id",
    "r"."event_id",
    "e"."org_id" AS "event_org_id",
    "e"."event_type",
    "e"."entity_type",
    "e"."entity_id",
    "e"."action_type",
    "e"."occurred_at"
   FROM ("public"."workflow_runs" "r"
     LEFT JOIN "public"."workflow_events" "e" ON (("e"."id" = "r"."event_id")));


ALTER VIEW "public"."workflow_run_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workflows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "event_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "org_id" "uuid" NOT NULL
);


ALTER TABLE "public"."workflows" OWNER TO "postgres";


ALTER TABLE ONLY "public"."access_methods"
    ADD CONSTRAINT "access_methods_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."access_methods"
    ADD CONSTRAINT "access_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_links"
    ADD CONSTRAINT "action_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."action_links"
    ADD CONSTRAINT "action_links_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."activity_log"
    ADD CONSTRAINT "activity_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."addon_frequencies"
    ADD CONSTRAINT "addon_frequencies_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."addon_frequencies"
    ADD CONSTRAINT "addon_frequencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."addon_types"
    ADD CONSTRAINT "addon_types_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."addon_types"
    ADD CONSTRAINT "addon_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_statuses"
    ADD CONSTRAINT "assignment_statuses_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."assignment_statuses"
    ADD CONSTRAINT "assignment_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."cleaning_job_addons"
    ADD CONSTRAINT "cleaning_job_addons_pkey" PRIMARY KEY ("job_id", "addon_type_id");



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_pkey" PRIMARY KEY ("job_id");



ALTER TABLE ONLY "public"."cleaning_service_types"
    ADD CONSTRAINT "cleaning_service_types_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."cleaning_service_types"
    ADD CONSTRAINT "cleaning_service_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_pkey" PRIMARY KEY ("contact_id", "tag_id");



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_member_contact_roles"
    ADD CONSTRAINT "customer_member_contact_roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_member_contact_roles"
    ADD CONSTRAINT "customer_member_contact_roles_unique" UNIQUE ("org_id", "role_key");



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_unique" UNIQUE ("org_id", "customer_member_id", "contact_id", "role_key");



ALTER TABLE ONLY "public"."customer_member_relationship_types"
    ADD CONSTRAINT "customer_member_relationship_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_members"
    ADD CONSTRAINT "customer_members_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_payment_methods"
    ADD CONSTRAINT "customer_payment_methods_customer_id_stripe_payment_method__key" UNIQUE ("customer_id", "stripe_payment_method_id");



ALTER TABLE ONLY "public"."customer_payment_methods"
    ADD CONSTRAINT "customer_payment_methods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_person_role_types"
    ADD CONSTRAINT "customer_person_role_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_persons"
    ADD CONSTRAINT "customer_persons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_subscriptions"
    ADD CONSTRAINT "customer_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_pkey" PRIMARY KEY ("customer_id", "tag_id");



ALTER TABLE ONLY "public"."customer_vertical_job_counters"
    ADD CONSTRAINT "customer_vertical_job_counters_pkey" PRIMARY KEY ("customer_id", "vertical_id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_code_unique" UNIQUE ("code");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_program_benefits"
    ADD CONSTRAINT "discount_program_benefits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_program_commitment_rules"
    ADD CONSTRAINT "discount_program_commitment_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_program_commitment_rules"
    ADD CONSTRAINT "discount_program_commitment_rules_program_unique" UNIQUE ("discount_program_id");



ALTER TABLE ONLY "public"."discount_program_qualifiers"
    ADD CONSTRAINT "discount_program_qualifiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_programs"
    ADD CONSTRAINT "discount_programs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_field_definitions"
    ADD CONSTRAINT "document_field_definitions_org_doc_type_field_key_key" UNIQUE ("org_id", "doc_type", "field_key");



ALTER TABLE ONLY "public"."document_field_definitions"
    ADD CONSTRAINT "document_field_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_field_values"
    ADD CONSTRAINT "document_field_values_document_id_field_key_key" UNIQUE ("document_id", "field_key");



ALTER TABLE ONLY "public"."document_field_values"
    ADD CONSTRAINT "document_field_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_version_number_key" UNIQUE ("document_id", "version_number");



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_unique" UNIQUE ("org_id", "entity_type");



ALTER TABLE ONLY "public"."external_mappings"
    ADD CONSTRAINT "external_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."external_mappings"
    ADD CONSTRAINT "external_mappings_source_entity_type_external_id_key" UNIQUE ("source", "entity_type", "external_id");



ALTER TABLE ONLY "public"."field_definitions"
    ADD CONSTRAINT "field_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gl_account_mappings"
    ADD CONSTRAINT "gl_account_mappings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gl_accounts"
    ADD CONSTRAINT "gl_accounts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gl_journal_entries"
    ADD CONSTRAINT "gl_journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."home_types"
    ADD CONSTRAINT "home_types_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."home_types"
    ADD CONSTRAINT "home_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."industries"
    ADD CONSTRAINT "industries_key_unique" UNIQUE ("key");



ALTER TABLE ONLY "public"."industries"
    ADD CONSTRAINT "industries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."industry_default_entity_labels"
    ADD CONSTRAINT "industry_default_entity_labels_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."industry_default_entity_labels"
    ADD CONSTRAINT "industry_default_entity_labels_unique" UNIQUE ("industry_id", "entity_type");



ALTER TABLE ONLY "public"."job_statuses"
    ADD CONSTRAINT "job_statuses_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."job_statuses"
    ADD CONSTRAINT "job_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."job_tags"
    ADD CONSTRAINT "job_tags_pkey" PRIMARY KEY ("job_id", "tag_id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_tags"
    ADD CONSTRAINT "location_tags_pkey" PRIMARY KEY ("location_id", "tag_id");



ALTER TABLE ONLY "public"."location_types"
    ADD CONSTRAINT "location_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."location_types"
    ADD CONSTRAINT "location_types_unique" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages_outbox"
    ADD CONSTRAINT "messages_outbox_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."opportunity_tags"
    ADD CONSTRAINT "opportunity_tags_pkey" PRIMARY KEY ("opportunity_id", "tag_id");



ALTER TABLE ONLY "public"."org_settings"
    ADD CONSTRAINT "org_settings_org_id_key" UNIQUE ("org_id");



ALTER TABLE ONLY "public"."org_settings"
    ADD CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."payment_statuses"
    ADD CONSTRAINT "payment_statuses_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."payment_statuses"
    ADD CONSTRAINT "payment_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permission_definitions"
    ADD CONSTRAINT "permission_definitions_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."permission_definitions"
    ADD CONSTRAINT "permission_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permission_keys"
    ADD CONSTRAINT "permission_keys_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."permissions"
    ADD CONSTRAINT "permissions_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."person_locations"
    ADD CONSTRAINT "person_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_relationship_type_settings"
    ADD CONSTRAINT "person_relationship_type_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "person_relationships_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."persons"
    ADD CONSTRAINT "persons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_ghl_stage_uuid_key" UNIQUE ("pipeline_id", "ghl_stage_uuid");



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_ghl_pipeline_id_key" UNIQUE ("ghl_pipeline_id");



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_addons"
    ADD CONSTRAINT "pricing_addons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_addons"
    ADD CONSTRAINT "pricing_addons_vertical_key_uniq" UNIQUE ("vertical_id", "addon_key");



ALTER TABLE ONLY "public"."pricing_dimension_values"
    ADD CONSTRAINT "pricing_dimension_values_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_dimensions"
    ADD CONSTRAINT "pricing_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_first_clean_prices"
    ADD CONSTRAINT "pricing_first_clean_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_first_clean_prices"
    ADD CONSTRAINT "pricing_first_clean_unique" UNIQUE ("vertical_id", "service_id", "sqft_tier_id");



ALTER TABLE ONLY "public"."pricing_frequencies"
    ADD CONSTRAINT "pricing_frequencies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_modes"
    ADD CONSTRAINT "pricing_modes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_recurring_prices"
    ADD CONSTRAINT "pricing_recurring_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_unique_vertical_service" UNIQUE ("vertical_id", "service_key");



ALTER TABLE ONLY "public"."pricing_square_footage_tiers"
    ADD CONSTRAINT "pricing_sqft_unique_vertical_sqft_key" UNIQUE ("vertical_id", "sqft_key");



ALTER TABLE ONLY "public"."pricing_square_footage_tiers"
    ADD CONSTRAINT "pricing_square_footage_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recurrence_plans"
    ADD CONSTRAINT "recurrence_plans_job_id_key" UNIQUE ("job_id");



ALTER TABLE ONLY "public"."recurrence_plans"
    ADD CONSTRAINT "recurrence_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_definitions"
    ADD CONSTRAINT "role_definitions_org_role_key_uk" UNIQUE ("org_id", "role_key");



ALTER TABLE ONLY "public"."role_definitions"
    ADD CONSTRAINT "role_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_org_role_perm_uk" UNIQUE ("org_id", "role_key", "permission_key");



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_unique" UNIQUE ("org_id", "role_key", "permission_key");



ALTER TABLE ONLY "public"."schedule_statuses"
    ADD CONSTRAINT "schedule_statuses_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."schedule_statuses"
    ADD CONSTRAINT "schedule_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedule_tags"
    ADD CONSTRAINT "schedule_tags_pkey" PRIMARY KEY ("schedule_id", "tag_id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_offerings"
    ADD CONSTRAINT "service_offerings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_plan_templates"
    ADD CONSTRAINT "service_plan_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_price_dimensions"
    ADD CONSTRAINT "service_price_dimensions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."service_pricing_rules"
    ADD CONSTRAINT "service_pricing_rules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."sqft_bands"
    ADD CONSTRAINT "sqft_bands_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."sqft_bands"
    ADD CONSTRAINT "sqft_bands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."tags"
    ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_vertical_job_counters"
    ADD CONSTRAINT "uniq_counter_per_customer_vertical" UNIQUE ("customer_id", "vertical_id");



ALTER TABLE ONLY "public"."discount_codes"
    ADD CONSTRAINT "uniq_discount_codes_code" UNIQUE ("code");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "uniq_redemption_per_contact_code" UNIQUE ("contact_id", "discount_code_id");



ALTER TABLE ONLY "public"."customer_persons"
    ADD CONSTRAINT "uq_customer_persons_unique" UNIQUE ("org_id", "customer_id", "person_id", "role_type");



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "uq_departments_org_key" UNIQUE ("org_id", "key");



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "uq_person_relationships_unique" UNIQUE ("org_id", "from_person_id", "to_person_id", "relationship_type");



ALTER TABLE ONLY "public"."work_units"
    ADD CONSTRAINT "uq_work_units_department_key" UNIQUE ("department_id", "key");



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."vendor_statuses"
    ADD CONSTRAINT "vendor_statuses_key_key" UNIQUE ("key");



ALTER TABLE ONLY "public"."vendor_statuses"
    ADD CONSTRAINT "vendor_statuses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_tags"
    ADD CONSTRAINT "vendor_tags_pkey" PRIMARY KEY ("vendor_id", "tag_id");



ALTER TABLE ONLY "public"."vendor_users"
    ADD CONSTRAINT "vendor_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."vendor_users"
    ADD CONSTRAINT "vendor_users_vendor_id_contact_id_key" UNIQUE ("vendor_id", "contact_id");



ALTER TABLE ONLY "public"."vendor_verticals"
    ADD CONSTRAINT "vendor_verticals_pkey" PRIMARY KEY ("vendor_id", "vertical_id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verticals"
    ADD CONSTRAINT "verticals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."verticals"
    ADD CONSTRAINT "verticals_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."work_units"
    ADD CONSTRAINT "work_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_action_runs"
    ADD CONSTRAINT "workflow_action_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_actions"
    ADD CONSTRAINT "workflow_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_conditions"
    ADD CONSTRAINT "workflow_conditions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_pkey" PRIMARY KEY ("id");



CREATE INDEX "action_links_entity_idx" ON "public"."action_links" USING "btree" ("entity_type", "entity_id");



CREATE UNIQUE INDEX "action_links_short_code_key" ON "public"."action_links" USING "btree" ("short_code") WHERE ("short_code" IS NOT NULL);



CREATE UNIQUE INDEX "action_links_short_code_uidx" ON "public"."action_links" USING "btree" ("short_code") WHERE ("short_code" IS NOT NULL);



CREATE UNIQUE INDEX "contacts_email_unique" ON "public"."contacts" USING "btree" ("lower"(TRIM(BOTH FROM "email"))) WHERE (("email" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "email")) > 0));



CREATE INDEX "contacts_org_status_idx" ON "public"."contacts" USING "btree" ("org_id", "status_key");



CREATE UNIQUE INDEX "contacts_phone_unique" ON "public"."contacts" USING "btree" ("phone") WHERE (("phone" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "phone")) > 0));



CREATE INDEX "customer_member_contact_roles_org_active_idx" ON "public"."customer_member_contact_roles" USING "btree" ("org_id", "is_active", "sort_order");



CREATE INDEX "customer_member_contacts_org_contact_idx" ON "public"."customer_member_contacts" USING "btree" ("org_id", "contact_id");



CREATE INDEX "customer_member_contacts_org_customer_idx" ON "public"."customer_member_contacts" USING "btree" ("org_id", "customer_id");



CREATE INDEX "customer_member_contacts_org_member_idx" ON "public"."customer_member_contacts" USING "btree" ("org_id", "customer_member_id");



CREATE UNIQUE INDEX "customer_member_relationship_types_org_key_unique" ON "public"."customer_member_relationship_types" USING "btree" ("org_id", "key");



CREATE INDEX "customer_member_relationship_types_org_sort_idx" ON "public"."customer_member_relationship_types" USING "btree" ("org_id", "sort_order", "label");



CREATE UNIQUE INDEX "customer_member_relationship_types_unique" ON "public"."customer_member_relationship_types" USING "btree" ("org_id", "key");



CREATE INDEX "customer_members_org_customer_idx" ON "public"."customer_members" USING "btree" ("org_id", "customer_id");



CREATE INDEX "customer_members_org_name_idx" ON "public"."customer_members" USING "btree" ("org_id", "display_name");



CREATE INDEX "customer_members_org_status_idx" ON "public"."customer_members" USING "btree" ("org_id", "status_key");



CREATE INDEX "customer_subscriptions_customer_id_idx" ON "public"."customer_subscriptions" USING "btree" ("customer_id");



CREATE INDEX "customer_subscriptions_customer_idx" ON "public"."customer_subscriptions" USING "btree" ("customer_id");



CREATE INDEX "customer_subscriptions_status_idx" ON "public"."customer_subscriptions" USING "btree" ("status");



CREATE INDEX "customers_org_status_idx" ON "public"."customers" USING "btree" ("org_id", "status_key");



CREATE UNIQUE INDEX "customers_stripe_customer_unique" ON "public"."customers" USING "btree" ("stripe_customer_id") WHERE (("stripe_customer_id" IS NOT NULL) AND ("length"(TRIM(BOTH FROM "stripe_customer_id")) > 0));



CREATE INDEX "discount_applications_commitment_idx" ON "public"."discount_applications" USING "btree" ("discount_commitment_id");



CREATE INDEX "discount_applications_customer_idx" ON "public"."discount_applications" USING "btree" ("org_id", "customer_id");



CREATE INDEX "discount_applications_legacy_discount_code_id_idx" ON "public"."discount_applications" USING "btree" ("legacy_discount_code_id") WHERE ("legacy_discount_code_id" IS NOT NULL);



CREATE UNIQUE INDEX "discount_applications_legacy_discount_redemption_id_uidx" ON "public"."discount_applications" USING "btree" ("legacy_discount_redemption_id") WHERE ("legacy_discount_redemption_id" IS NOT NULL);



CREATE INDEX "discount_applications_org_target_idx" ON "public"."discount_applications" USING "btree" ("org_id", "target_entity_type", "target_entity_id");



CREATE INDEX "discount_applications_program_idx" ON "public"."discount_applications" USING "btree" ("discount_program_id");



CREATE INDEX "discount_commitments_org_customer_idx" ON "public"."discount_commitments" USING "btree" ("org_id", "customer_id");



CREATE INDEX "discount_commitments_program_idx" ON "public"."discount_commitments" USING "btree" ("discount_program_id");



CREATE INDEX "discount_commitments_status_idx" ON "public"."discount_commitments" USING "btree" ("org_id", "status");



CREATE INDEX "discount_program_benefits_org_idx" ON "public"."discount_program_benefits" USING "btree" ("org_id");



CREATE INDEX "discount_program_benefits_program_idx" ON "public"."discount_program_benefits" USING "btree" ("discount_program_id");



CREATE INDEX "discount_program_commitment_rules_org_idx" ON "public"."discount_program_commitment_rules" USING "btree" ("org_id");



CREATE INDEX "discount_program_commitment_rules_program_idx" ON "public"."discount_program_commitment_rules" USING "btree" ("discount_program_id");



CREATE INDEX "discount_program_qualifiers_org_idx" ON "public"."discount_program_qualifiers" USING "btree" ("org_id");



CREATE INDEX "discount_program_qualifiers_program_idx" ON "public"."discount_program_qualifiers" USING "btree" ("discount_program_id", "sort_order");



CREATE UNIQUE INDEX "discount_programs_legacy_discount_code_id_uidx" ON "public"."discount_programs" USING "btree" ("legacy_discount_code_id") WHERE ("legacy_discount_code_id" IS NOT NULL);



CREATE UNIQUE INDEX "discount_programs_org_code_unique_active_idx" ON "public"."discount_programs" USING "btree" ("org_id", "lower"("code")) WHERE ("code" IS NOT NULL);



CREATE INDEX "discount_programs_org_program_type_idx" ON "public"."discount_programs" USING "btree" ("org_id", "program_type");



CREATE INDEX "discount_programs_org_status_idx" ON "public"."discount_programs" USING "btree" ("org_id", "status");



CREATE UNIQUE INDEX "discount_redemptions_unique_code" ON "public"."discount_redemptions" USING "btree" ("customer_id", "discount_code_id") WHERE ("discount_code_id" IS NOT NULL);



CREATE UNIQUE INDEX "discount_redemptions_unique_program" ON "public"."discount_redemptions" USING "btree" ("customer_id", "discount_program_id") WHERE ("discount_program_id" IS NOT NULL);



CREATE INDEX "entity_labels_entity_type_idx" ON "public"."entity_labels" USING "btree" ("entity_type");



CREATE INDEX "entity_labels_org_id_idx" ON "public"."entity_labels" USING "btree" ("org_id");



CREATE UNIQUE INDEX "gl_account_mappings_org_key_uq" ON "public"."gl_account_mappings" USING "btree" ("org_id", "key");



CREATE UNIQUE INDEX "gl_accounts_org_code_uq" ON "public"."gl_accounts" USING "btree" ("org_id", "code");



CREATE INDEX "gl_accounts_org_type_idx" ON "public"."gl_accounts" USING "btree" ("org_id", "type");



CREATE INDEX "gl_journal_entries_org_date_idx" ON "public"."gl_journal_entries" USING "btree" ("org_id", "entry_date");



CREATE INDEX "gl_journal_entries_org_source_idx" ON "public"."gl_journal_entries" USING "btree" ("org_id", "source_type", "source_id");



CREATE INDEX "gl_journal_lines_entry_idx" ON "public"."gl_journal_lines" USING "btree" ("entry_id", "line_no");



CREATE INDEX "gl_journal_lines_org_account_idx" ON "public"."gl_journal_lines" USING "btree" ("org_id", "account_id");



CREATE INDEX "gl_journal_lines_org_job_idx" ON "public"."gl_journal_lines" USING "btree" ("org_id", "job_id");



CREATE INDEX "idx_activity_entity" ON "public"."activity_log" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_addon_types_vertical_id" ON "public"."addon_types" USING "btree" ("vertical_id");



CREATE UNIQUE INDEX "idx_addons_unique" ON "public"."pricing_addons" USING "btree" ("vertical_id", "addon_key");



CREATE INDEX "idx_app_users_org_id" ON "public"."app_users" USING "btree" ("org_id");



CREATE INDEX "idx_assignments_job" ON "public"."assignments" USING "btree" ("job_id");



CREATE INDEX "idx_assignments_org_id" ON "public"."assignments" USING "btree" ("org_id");



CREATE INDEX "idx_assignments_schedule" ON "public"."assignments" USING "btree" ("schedule_id");



CREATE INDEX "idx_assignments_status" ON "public"."assignments" USING "btree" ("assignment_status_id");



CREATE INDEX "idx_assignments_vendor" ON "public"."assignments" USING "btree" ("vendor_id");



CREATE INDEX "idx_contacts_archived" ON "public"."contacts" USING "btree" ("org_id", "archived_at");



CREATE INDEX "idx_contacts_customer_id" ON "public"."contacts" USING "btree" ("customer_id");



CREATE INDEX "idx_contacts_email" ON "public"."contacts" USING "btree" ("lower"("email"));



CREATE INDEX "idx_contacts_external" ON "public"."contacts" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_contacts_org_id" ON "public"."contacts" USING "btree" ("org_id");



CREATE INDEX "idx_contacts_person_id" ON "public"."contacts" USING "btree" ("person_id");



CREATE INDEX "idx_contacts_phone" ON "public"."contacts" USING "btree" ("phone");



CREATE INDEX "idx_contacts_postal_code" ON "public"."contacts" USING "btree" ("postal_code");



CREATE INDEX "idx_contacts_vendor_id" ON "public"."contacts" USING "btree" ("vendor_id");



CREATE INDEX "idx_customer_members_person_id" ON "public"."customer_members" USING "btree" ("person_id");



CREATE INDEX "idx_customer_person_role_types_active" ON "public"."customer_person_role_types" USING "btree" ("org_id", "is_active", "sort_order", "label");



CREATE INDEX "idx_customer_person_role_types_industry_id" ON "public"."customer_person_role_types" USING "btree" ("industry_id");



CREATE INDEX "idx_customer_person_role_types_org_id" ON "public"."customer_person_role_types" USING "btree" ("org_id");



CREATE INDEX "idx_customer_person_role_types_vertical_id" ON "public"."customer_person_role_types" USING "btree" ("vertical_id");



CREATE INDEX "idx_customer_persons_customer_id" ON "public"."customer_persons" USING "btree" ("customer_id");



CREATE INDEX "idx_customer_persons_org_id" ON "public"."customer_persons" USING "btree" ("org_id");



CREATE INDEX "idx_customer_persons_person_id" ON "public"."customer_persons" USING "btree" ("person_id");



CREATE INDEX "idx_customer_subscriptions_org_customer" ON "public"."customer_subscriptions" USING "btree" ("org_id", "customer_id");



CREATE INDEX "idx_customers_external" ON "public"."customers" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_customers_org_id" ON "public"."customers" USING "btree" ("org_id");



CREATE INDEX "idx_customers_primary_contact" ON "public"."customers" USING "btree" ("primary_contact_id");



CREATE INDEX "idx_customers_vertical_id" ON "public"."customers" USING "btree" ("vertical_id");



CREATE INDEX "idx_departments_org_active_sort" ON "public"."departments" USING "btree" ("org_id", "is_active", "sort_order");



CREATE INDEX "idx_departments_org_id" ON "public"."departments" USING "btree" ("org_id");



CREATE INDEX "idx_discount_codes_active" ON "public"."discount_codes" USING "btree" ("is_active");



CREATE INDEX "idx_discount_codes_code" ON "public"."discount_codes" USING "btree" ("code");



CREATE INDEX "idx_discount_redemptions_code" ON "public"."discount_redemptions" USING "btree" ("discount_code");



CREATE INDEX "idx_discount_redemptions_contact" ON "public"."discount_redemptions" USING "btree" ("contact_id");



CREATE INDEX "idx_discount_redemptions_created" ON "public"."discount_redemptions" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_discount_redemptions_discount_code" ON "public"."discount_redemptions" USING "btree" ("discount_code");



CREATE INDEX "idx_discount_redemptions_job" ON "public"."discount_redemptions" USING "btree" ("job_id");



CREATE INDEX "idx_discount_redemptions_opportunity" ON "public"."discount_redemptions" USING "btree" ("opportunity_id");



CREATE INDEX "idx_document_field_definitions_org_doc_type" ON "public"."document_field_definitions" USING "btree" ("org_id", "doc_type");



CREATE INDEX "idx_document_field_definitions_org_id" ON "public"."document_field_definitions" USING "btree" ("org_id");



CREATE INDEX "idx_document_field_values_document_id" ON "public"."document_field_values" USING "btree" ("document_id");



CREATE INDEX "idx_document_field_values_field_definition_id" ON "public"."document_field_values" USING "btree" ("field_definition_id");



CREATE INDEX "idx_document_field_values_org_id" ON "public"."document_field_values" USING "btree" ("org_id");



CREATE INDEX "idx_document_versions_document_id" ON "public"."document_versions" USING "btree" ("document_id");



CREATE INDEX "idx_document_versions_org_id" ON "public"."document_versions" USING "btree" ("org_id");



CREATE INDEX "idx_documents_created_at" ON "public"."documents" USING "btree" ("created_at");



CREATE INDEX "idx_documents_doc_type" ON "public"."documents" USING "btree" ("doc_type");



CREATE INDEX "idx_documents_entity" ON "public"."documents" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_documents_extraction_status" ON "public"."documents" USING "btree" ("extraction_status");



CREATE INDEX "idx_documents_generated_from_document_id" ON "public"."documents" USING "btree" ("generated_from_document_id");



CREATE INDEX "idx_documents_org_id" ON "public"."documents" USING "btree" ("org_id");



CREATE INDEX "idx_external_mappings_internal" ON "public"."external_mappings" USING "btree" ("internal_table", "internal_id");



CREATE INDEX "idx_field_values_entity" ON "public"."field_values" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "idx_field_values_org_entity" ON "public"."field_values" USING "btree" ("org_id", "entity_type", "entity_id");



CREATE UNIQUE INDEX "idx_first_clean_unique" ON "public"."pricing_first_clean_prices" USING "btree" ("vertical_id", "sqft_tier_id");



CREATE INDEX "idx_jobs_archived" ON "public"."jobs" USING "btree" ("org_id", "archived_at");



CREATE INDEX "idx_jobs_customer" ON "public"."jobs" USING "btree" ("customer_id");



CREATE INDEX "idx_jobs_customer_vertical_completed" ON "public"."jobs" USING "btree" ("customer_id", "vertical_id", "completed_at");



CREATE INDEX "idx_jobs_customer_vertical_created" ON "public"."jobs" USING "btree" ("customer_id", "vertical_id", "created_at");



CREATE INDEX "idx_jobs_external" ON "public"."jobs" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_jobs_is_recurring" ON "public"."jobs" USING "btree" ("is_recurring");



CREATE INDEX "idx_jobs_opportunity" ON "public"."jobs" USING "btree" ("opportunity_id");



CREATE INDEX "idx_jobs_org_id" ON "public"."jobs" USING "btree" ("org_id");



CREATE INDEX "idx_jobs_org_location" ON "public"."jobs" USING "btree" ("org_id", "location_id");



CREATE INDEX "idx_jobs_primary_person" ON "public"."jobs" USING "btree" ("primary_person_id");



CREATE INDEX "idx_jobs_status" ON "public"."jobs" USING "btree" ("job_status_id");



CREATE INDEX "idx_jobs_work_unit_id" ON "public"."jobs" USING "btree" ("work_unit_id") WHERE ("work_unit_id" IS NOT NULL);



CREATE INDEX "idx_locations_customer_id" ON "public"."locations" USING "btree" ("customer_id");



CREATE INDEX "idx_locations_external" ON "public"."locations" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_locations_org_customer" ON "public"."locations" USING "btree" ("org_id", "customer_id");



CREATE INDEX "idx_locations_org_id" ON "public"."locations" USING "btree" ("org_id");



CREATE INDEX "idx_locations_org_parent" ON "public"."locations" USING "btree" ("org_id", "parent_location_id");



CREATE INDEX "idx_locations_org_status_key" ON "public"."locations" USING "btree" ("org_id", "status_key");



CREATE INDEX "idx_locations_org_type" ON "public"."locations" USING "btree" ("org_id", "location_type");



CREATE INDEX "idx_locations_org_vendor" ON "public"."locations" USING "btree" ("org_id", "vendor_id");



CREATE INDEX "idx_messages_contact" ON "public"."messages" USING "btree" ("contact_id");



CREATE INDEX "idx_messages_contact_created" ON "public"."messages" USING "btree" ("contact_id", "created_at" DESC);



CREATE INDEX "idx_messages_created_at" ON "public"."messages" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_messages_customer" ON "public"."messages" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "idx_messages_job" ON "public"."messages" USING "btree" ("job_id");



CREATE INDEX "idx_messages_opportunity" ON "public"."messages" USING "btree" ("opportunity_id", "created_at" DESC);



CREATE INDEX "idx_messages_related" ON "public"."messages" USING "btree" ("related_entity_type", "related_entity_id");



CREATE INDEX "idx_messages_status" ON "public"."messages" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "idx_messages_workflow_run" ON "public"."messages" USING "btree" ("workflow_run_id");



CREATE INDEX "idx_opportunities_org_id" ON "public"."opportunities" USING "btree" ("org_id");



CREATE INDEX "idx_opportunities_primary_person" ON "public"."opportunities" USING "btree" ("primary_person_id");



CREATE INDEX "idx_opps_contact" ON "public"."opportunities" USING "btree" ("primary_contact_id");



CREATE INDEX "idx_opps_customer" ON "public"."opportunities" USING "btree" ("customer_id");



CREATE INDEX "idx_opps_external" ON "public"."opportunities" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_opps_stage" ON "public"."opportunities" USING "btree" ("pipeline_stage_id");



CREATE INDEX "idx_payments_customer" ON "public"."payments" USING "btree" ("customer_id");



CREATE INDEX "idx_payments_job" ON "public"."payments" USING "btree" ("job_id");



CREATE INDEX "idx_payments_org_id" ON "public"."payments" USING "btree" ("org_id");



CREATE INDEX "idx_payments_posted_to_ledger" ON "public"."payments" USING "btree" ("org_id", "posted_to_ledger_at");



CREATE INDEX "idx_payments_provider" ON "public"."payments" USING "btree" ("provider", "provider_payment_id");



CREATE INDEX "idx_payments_status" ON "public"."payments" USING "btree" ("payment_status_id");



CREATE INDEX "idx_person_locations_location" ON "public"."person_locations" USING "btree" ("location_id");



CREATE INDEX "idx_person_locations_org" ON "public"."person_locations" USING "btree" ("org_id");



CREATE INDEX "idx_person_locations_person" ON "public"."person_locations" USING "btree" ("person_id");



CREATE INDEX "idx_person_relationship_type_settings_active" ON "public"."person_relationship_type_settings" USING "btree" ("org_id", "is_active", "sort_order", "label");



CREATE INDEX "idx_person_relationship_type_settings_industry_id" ON "public"."person_relationship_type_settings" USING "btree" ("industry_id");



CREATE INDEX "idx_person_relationship_type_settings_org_id" ON "public"."person_relationship_type_settings" USING "btree" ("org_id");



CREATE INDEX "idx_person_relationship_type_settings_vertical_id" ON "public"."person_relationship_type_settings" USING "btree" ("vertical_id");



CREATE INDEX "idx_person_relationships_from_person_id" ON "public"."person_relationships" USING "btree" ("from_person_id");



CREATE INDEX "idx_person_relationships_org_id" ON "public"."person_relationships" USING "btree" ("org_id");



CREATE INDEX "idx_person_relationships_to_person_id" ON "public"."person_relationships" USING "btree" ("to_person_id");



CREATE INDEX "idx_persons_email" ON "public"."persons" USING "btree" ("email");



CREATE INDEX "idx_persons_full_name" ON "public"."persons" USING "btree" ("full_name");



CREATE INDEX "idx_persons_org_id" ON "public"."persons" USING "btree" ("org_id");



CREATE INDEX "idx_persons_phone" ON "public"."persons" USING "btree" ("phone");



CREATE UNIQUE INDEX "idx_pricing_freq_unique" ON "public"."pricing_frequencies" USING "btree" ("vertical_id", "frequency_key");



CREATE UNIQUE INDEX "idx_pricing_services_unique" ON "public"."pricing_services" USING "btree" ("vertical_id", "service_key");



CREATE UNIQUE INDEX "idx_pricing_sqft_unique" ON "public"."pricing_square_footage_tiers" USING "btree" ("vertical_id", "sqft_key");



CREATE INDEX "idx_quotes_job" ON "public"."quotes" USING "btree" ("job_id");



CREATE INDEX "idx_quotes_opp" ON "public"."quotes" USING "btree" ("opportunity_id");



CREATE INDEX "idx_quotes_org_id" ON "public"."quotes" USING "btree" ("org_id");



CREATE UNIQUE INDEX "idx_recurring_unique" ON "public"."pricing_recurring_prices" USING "btree" ("vertical_id", "frequency_id", "sqft_tier_id");



CREATE INDEX "idx_schedules_job" ON "public"."schedules" USING "btree" ("job_id");



CREATE INDEX "idx_schedules_org_id" ON "public"."schedules" USING "btree" ("org_id");



CREATE INDEX "idx_schedules_org_id_start_at" ON "public"."schedules" USING "btree" ("org_id", "start_at");



CREATE INDEX "idx_schedules_org_location" ON "public"."schedules" USING "btree" ("org_id", "location_id");



CREATE INDEX "idx_schedules_start_at" ON "public"."schedules" USING "btree" ("start_at");



CREATE INDEX "idx_schedules_status" ON "public"."schedules" USING "btree" ("schedule_status_id");



CREATE INDEX "idx_schedules_subscription" ON "public"."schedules" USING "btree" ("customer_subscription_id", "subscription_sequence");



CREATE INDEX "idx_user_roles_org_id" ON "public"."user_roles" USING "btree" ("org_id");



CREATE INDEX "idx_user_roles_role" ON "public"."user_roles" USING "btree" ("role");



CREATE INDEX "idx_vendor_users_external" ON "public"."vendor_users" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_vendor_users_org_id" ON "public"."vendor_users" USING "btree" ("org_id");



CREATE INDEX "idx_vendor_users_vendor_id" ON "public"."vendor_users" USING "btree" ("vendor_id");



CREATE INDEX "idx_vendor_verticals_vertical_id" ON "public"."vendor_verticals" USING "btree" ("vertical_id");



CREATE INDEX "idx_vendors_company_name" ON "public"."vendors" USING "btree" ("company_name");



CREATE INDEX "idx_vendors_days_available_gin" ON "public"."vendors" USING "gin" ("days_available");



CREATE INDEX "idx_vendors_external" ON "public"."vendors" USING "btree" ("external_source", "external_id");



CREATE INDEX "idx_vendors_org_id" ON "public"."vendors" USING "btree" ("org_id");



CREATE INDEX "idx_vendors_service_area_zip_codes_gin" ON "public"."vendors" USING "gin" ("service_area_zip_codes");



CREATE INDEX "idx_vendors_status" ON "public"."vendors" USING "btree" ("status");



CREATE INDEX "idx_vendors_submitted_at" ON "public"."vendors" USING "btree" ("submitted_at");



CREATE INDEX "idx_work_units_department_id" ON "public"."work_units" USING "btree" ("department_id");



CREATE INDEX "idx_work_units_org_department_active_sort" ON "public"."work_units" USING "btree" ("org_id", "department_id", "is_active", "sort_order");



CREATE INDEX "idx_work_units_org_id" ON "public"."work_units" USING "btree" ("org_id");



CREATE INDEX "idx_workflow_actions_order" ON "public"."workflow_actions" USING "btree" ("workflow_id", "action_order");



CREATE INDEX "idx_workflow_actions_workflow" ON "public"."workflow_actions" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_conditions_workflow" ON "public"."workflow_conditions" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflow_runs_workflow" ON "public"."workflow_runs" USING "btree" ("workflow_id");



CREATE INDEX "idx_workflows_enabled" ON "public"."workflows" USING "btree" ("enabled") WHERE ("enabled" = true);



CREATE INDEX "idx_workflows_entity" ON "public"."workflows" USING "btree" ("entity_type");



CREATE INDEX "idx_workflows_trigger" ON "public"."workflows" USING "btree" ("event_type");



CREATE INDEX "industries_is_active_idx" ON "public"."industries" USING "btree" ("is_active");



CREATE INDEX "industry_default_entity_labels_entity_type_idx" ON "public"."industry_default_entity_labels" USING "btree" ("entity_type");



CREATE INDEX "industry_default_entity_labels_industry_id_idx" ON "public"."industry_default_entity_labels" USING "btree" ("industry_id");



CREATE INDEX "job_statuses_org_id_idx" ON "public"."job_statuses" USING "btree" ("org_id");



CREATE INDEX "jobs_assigned_vendor_id_idx" ON "public"."jobs" USING "btree" ("assigned_vendor_id");



CREATE INDEX "jobs_discount_program_id_idx" ON "public"."jobs" USING "btree" ("discount_program_id");



CREATE INDEX "jobs_org_status_idx" ON "public"."jobs" USING "btree" ("org_id", "status_key");



CREATE INDEX "ledger_tx_org_job_idx" ON "public"."ledger_transactions" USING "btree" ("org_id", "job_id");



CREATE INDEX "ledger_tx_org_occurred_idx" ON "public"."ledger_transactions" USING "btree" ("org_id", "occurred_at");



CREATE INDEX "location_types_is_active_idx" ON "public"."location_types" USING "btree" ("org_id", "is_active");



CREATE INDEX "location_types_org_id_idx" ON "public"."location_types" USING "btree" ("org_id");



CREATE INDEX "locations_location_type_id_idx" ON "public"."locations" USING "btree" ("org_id", "location_type_id");



CREATE UNIQUE INDEX "messages_outbox_dedupe_key_uq" ON "public"."messages_outbox" USING "btree" ("dedupe_key") WHERE ("dedupe_key" IS NOT NULL);



CREATE INDEX "messages_outbox_org_created_idx" ON "public"."messages_outbox" USING "btree" ("org_id", "created_at" DESC);



CREATE INDEX "messages_outbox_status_idx" ON "public"."messages_outbox" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "opportunities_discount_program_id_idx" ON "public"."opportunities" USING "btree" ("discount_program_id");



CREATE INDEX "opportunities_org_status_idx" ON "public"."opportunities" USING "btree" ("org_id", "status_key");



CREATE INDEX "org_settings_org_idx" ON "public"."org_settings" USING "btree" ("org_id");



CREATE INDEX "orgs_industry_id_idx" ON "public"."orgs" USING "btree" ("industry_id");



CREATE INDEX "payments_org_status_idx" ON "public"."payments" USING "btree" ("org_id", "status_key");



CREATE UNIQUE INDEX "payments_provider_payment_id_ux" ON "public"."payments" USING "btree" ("provider_payment_id") WHERE ("provider_payment_id" IS NOT NULL);



CREATE INDEX "permission_definitions_group_key_idx" ON "public"."permission_definitions" USING "btree" ("group_key");



CREATE INDEX "permission_definitions_is_active_idx" ON "public"."permission_definitions" USING "btree" ("is_active");



CREATE INDEX "pipeline_stages_org_id_idx" ON "public"."pipeline_stages" USING "btree" ("org_id");



CREATE INDEX "pipelines_org_id_idx" ON "public"."pipelines" USING "btree" ("org_id");



CREATE INDEX "pricing_frequencies_recur_idx" ON "public"."pricing_frequencies" USING "btree" ("recurrence_unit", "recurrence_interval");



CREATE INDEX "pricing_matrix_dimension_idx" ON "public"."pricing_matrix" USING "btree" ("pricing_dimension_value_id");



CREATE INDEX "pricing_matrix_mode_idx" ON "public"."pricing_matrix" USING "btree" ("pricing_mode_id");



CREATE INDEX "pricing_matrix_org_idx" ON "public"."pricing_matrix" USING "btree" ("org_id");



CREATE INDEX "pricing_matrix_plan_idx" ON "public"."pricing_matrix" USING "btree" ("service_plan_template_id");



CREATE INDEX "pricing_matrix_vertical_idx" ON "public"."pricing_matrix" USING "btree" ("vertical_id");



CREATE UNIQUE INDEX "role_definitions_org_role_key_uq" ON "public"."role_definitions" USING "btree" ("org_id", "role_key");



CREATE INDEX "role_permission_grants_org_idx" ON "public"."role_permission_grants" USING "btree" ("org_id");



CREATE INDEX "role_permission_grants_org_role_idx" ON "public"."role_permission_grants" USING "btree" ("org_id", "role_key");



CREATE UNIQUE INDEX "role_permission_grants_org_role_perm_uq" ON "public"."role_permission_grants" USING "btree" ("org_id", "role_key", "permission_key");



CREATE INDEX "role_permission_grants_permission_idx" ON "public"."role_permission_grants" USING "btree" ("permission_key");



CREATE INDEX "schedules_job_status_idx" ON "public"."schedules" USING "btree" ("org_id", "job_id", "status_key");



CREATE INDEX "schedules_job_vendor_status_idx" ON "public"."schedules" USING "btree" ("org_id", "job_id", "assigned_vendor_id", "status_key");



CREATE INDEX "schedules_org_assigned_vendor_idx" ON "public"."schedules" USING "btree" ("org_id", "assigned_vendor_id");



CREATE INDEX "schedules_org_job_start_idx" ON "public"."schedules" USING "btree" ("org_id", "job_id", "start_at");



CREATE INDEX "schedules_org_job_status_idx" ON "public"."schedules" USING "btree" ("org_id", "job_id", "status_key");



CREATE INDEX "schedules_org_job_vendor_status_idx" ON "public"."schedules" USING "btree" ("org_id", "job_id", "assigned_vendor_id", "status_key");



CREATE INDEX "schedules_org_status_idx" ON "public"."schedules" USING "btree" ("org_id", "status_key");



CREATE INDEX "schedules_subscription_idx" ON "public"."schedules" USING "btree" ("customer_subscription_id");



CREATE INDEX "service_offerings_org_active_idx" ON "public"."service_offerings" USING "btree" ("org_id", "is_active");



CREATE UNIQUE INDEX "service_offerings_org_key_uidx" ON "public"."service_offerings" USING "btree" ("org_id", "offering_key");



CREATE INDEX "service_plan_templates_org_active_idx" ON "public"."service_plan_templates" USING "btree" ("org_id", "is_active");



CREATE UNIQUE INDEX "service_plan_templates_org_key_uidx" ON "public"."service_plan_templates" USING "btree" ("org_id", "plan_key");



CREATE INDEX "service_price_dimensions_rule_idx" ON "public"."service_price_dimensions" USING "btree" ("pricing_rule_id");



CREATE INDEX "service_pricing_rules_offering_idx" ON "public"."service_pricing_rules" USING "btree" ("service_offering_id");



CREATE INDEX "service_pricing_rules_org_active_idx" ON "public"."service_pricing_rules" USING "btree" ("org_id", "is_active");



CREATE INDEX "service_pricing_rules_org_idx" ON "public"."service_pricing_rules" USING "btree" ("org_id");



CREATE INDEX "service_pricing_rules_plan_idx" ON "public"."service_pricing_rules" USING "btree" ("service_plan_template_id");



CREATE INDEX "status_definitions_org_entity_sort_idx" ON "public"."status_definitions" USING "btree" ("org_id", "entity_type", "sort_order");



CREATE UNIQUE INDEX "status_definitions_unique_scope" ON "public"."status_definitions" USING "btree" (COALESCE("org_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("industry_key", ''::"text"), "entity_type", "status_key");



CREATE UNIQUE INDEX "uniq_redemption_per_customer_code" ON "public"."discount_redemptions" USING "btree" ("customer_id", "discount_code_id") WHERE ("customer_id" IS NOT NULL);



CREATE UNIQUE INDEX "uniq_user_roles_user_org_role" ON "public"."user_roles" USING "btree" ("user_id", "org_id", "role");



CREATE UNIQUE INDEX "uniq_workflow_action_order" ON "public"."workflow_actions" USING "btree" ("workflow_id", "action_order");



CREATE UNIQUE INDEX "uniq_workflow_actions_order" ON "public"."workflow_actions" USING "btree" ("workflow_id", "action_order");



CREATE UNIQUE INDEX "uq_customer_person_role_types_scope_key" ON "public"."customer_person_role_types" USING "btree" ("org_id", COALESCE("industry_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("vertical_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "key");



CREATE UNIQUE INDEX "uq_customer_subscriptions_active" ON "public"."customer_subscriptions" USING "btree" ("org_id", "customer_id", "vertical_id", "cadence", "interval") WHERE ("status" = 'active'::"text");



CREATE UNIQUE INDEX "uq_person_locations_person_location" ON "public"."person_locations" USING "btree" ("person_id", "location_id");



CREATE UNIQUE INDEX "uq_person_relationship_type_settings_scope_key" ON "public"."person_relationship_type_settings" USING "btree" ("org_id", COALESCE("industry_id", '00000000-0000-0000-0000-000000000000'::"uuid"), COALESCE("vertical_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "key");



CREATE UNIQUE INDEX "uq_pricing_matrix_lookup" ON "public"."pricing_matrix" USING "btree" ("org_id", "vertical_id", "service_offering_id", COALESCE("service_plan_template_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "pricing_mode_id", COALESCE("pricing_dimension_value_id", '00000000-0000-0000-0000-000000000000'::"uuid"), "currency");



CREATE UNIQUE INDEX "uq_pricing_matrix_source" ON "public"."pricing_matrix" USING "btree" ("source_table", "source_id");



CREATE INDEX "user_roles_org_user_idx" ON "public"."user_roles" USING "btree" ("org_id", "user_id");



CREATE UNIQUE INDEX "ux_contacts_email_not_null" ON "public"."contacts" USING "btree" ("lower"("email")) WHERE (("email" IS NOT NULL) AND ("email" <> ''::"text"));



CREATE UNIQUE INDEX "ux_contacts_phone_not_null" ON "public"."contacts" USING "btree" ("phone") WHERE (("phone" IS NOT NULL) AND ("phone" <> ''::"text"));



CREATE UNIQUE INDEX "ux_customers_stripe_customer_id_not_null" ON "public"."customers" USING "btree" ("stripe_customer_id") WHERE (("stripe_customer_id" IS NOT NULL) AND ("stripe_customer_id" <> ''::"text"));



CREATE UNIQUE INDEX "ux_external_mappings_unique" ON "public"."external_mappings" USING "btree" ("source", "entity_type", "external_id", "internal_table");



CREATE UNIQUE INDEX "ux_field_definitions_org_entity_key" ON "public"."field_definitions" USING "btree" ("org_id", "entity_type", "field_key");



CREATE UNIQUE INDEX "ux_field_values_field_entity" ON "public"."field_values" USING "btree" ("field_definition_id", "entity_id");



CREATE UNIQUE INDEX "ux_first_clean_prices" ON "public"."pricing_first_clean_prices" USING "btree" ("vertical_id", "service_id", "sqft_tier_id");



CREATE UNIQUE INDEX "ux_first_clean_vertical_service_sqft" ON "public"."pricing_first_clean_prices" USING "btree" ("vertical_id", "service_id", "sqft_tier_id");



CREATE UNIQUE INDEX "ux_gl_account_mappings_org_key_active" ON "public"."gl_account_mappings" USING "btree" ("org_id", "key") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "ux_gl_accounts_org_code" ON "public"."gl_accounts" USING "btree" ("org_id", "code") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "ux_gl_accounts_org_code_active" ON "public"."gl_accounts" USING "btree" ("org_id", "code") WHERE ("is_active" = true);



CREATE UNIQUE INDEX "ux_gl_journal_entries_source" ON "public"."gl_journal_entries" USING "btree" ("org_id", "source_type", "source_id") WHERE (("source_type" IS NOT NULL) AND ("source_id" IS NOT NULL));



CREATE UNIQUE INDEX "ux_gl_journal_lines_entry_line" ON "public"."gl_journal_lines" USING "btree" ("entry_id", "line_no");



CREATE UNIQUE INDEX "ux_ledger_transactions_provider_ref" ON "public"."ledger_transactions" USING "btree" ("org_id", "provider", "provider_ref") WHERE (("provider" IS NOT NULL) AND ("provider_ref" IS NOT NULL));



CREATE UNIQUE INDEX "ux_pricing_addons_vertical_addon_key" ON "public"."pricing_addons" USING "btree" ("vertical_id", "addon_key");



CREATE UNIQUE INDEX "ux_pricing_dimension_values_key" ON "public"."pricing_dimension_values" USING "btree" ("dimension_id", "value_key");



CREATE UNIQUE INDEX "ux_pricing_dimensions_vertical_key" ON "public"."pricing_dimensions" USING "btree" ("vertical_id", "dimension_key");



CREATE UNIQUE INDEX "ux_pricing_first_clean_unique" ON "public"."pricing_first_clean_prices" USING "btree" ("vertical_id", "sqft_tier_id", "service_id");



CREATE UNIQUE INDEX "ux_pricing_freq_vertical_key" ON "public"."pricing_frequencies" USING "btree" ("vertical_id", "frequency_key");



CREATE UNIQUE INDEX "ux_pricing_matrix_rule" ON "public"."pricing_matrix" USING "btree" ("vertical_id", "service_offering_id", "service_plan_template_id", "pricing_mode_id", "pricing_dimension_value_id");



CREATE UNIQUE INDEX "ux_pricing_modes_vertical_key" ON "public"."pricing_modes" USING "btree" ("vertical_id", "mode_key");



CREATE UNIQUE INDEX "ux_pricing_recurring_unique" ON "public"."pricing_recurring_prices" USING "btree" ("vertical_id", "frequency_id", "sqft_tier_id", "service_id");



CREATE UNIQUE INDEX "ux_recurring_prices" ON "public"."pricing_recurring_prices" USING "btree" ("vertical_id", "service_id", "frequency_id", "sqft_tier_id");



CREATE UNIQUE INDEX "ux_recurring_vertical_frequency_sqft" ON "public"."pricing_recurring_prices" USING "btree" ("vertical_id", "frequency_id", "sqft_tier_id");



CREATE INDEX "vendors_drivers_license_doc_path_idx" ON "public"."vendors" USING "btree" ("drivers_license_doc_path");



CREATE INDEX "vendors_insurance_doc_path_idx" ON "public"."vendors" USING "btree" ("insurance_doc_path");



CREATE INDEX "vendors_org_payout_override_idx" ON "public"."vendors" USING "btree" ("org_id", "payout_override_type");



CREATE INDEX "vendors_org_status_idx" ON "public"."vendors" USING "btree" ("org_id", "status_key");



CREATE INDEX "workflow_action_runs_org_run_idx" ON "public"."workflow_action_runs" USING "btree" ("org_id", "workflow_run_id", "started_at" DESC);



CREATE INDEX "workflow_action_runs_org_status_idx" ON "public"."workflow_action_runs" USING "btree" ("org_id", "status", "started_at" DESC);



CREATE INDEX "workflow_actions_org_id_idx" ON "public"."workflow_actions" USING "btree" ("org_id");



CREATE INDEX "workflow_conditions_org_id_idx" ON "public"."workflow_conditions" USING "btree" ("org_id");



CREATE INDEX "workflow_events_entity_idx" ON "public"."workflow_events" USING "btree" ("entity_type", "entity_id");



CREATE INDEX "workflow_events_event_type_idx" ON "public"."workflow_events" USING "btree" ("event_type");



CREATE INDEX "workflow_events_org_entity_idx" ON "public"."workflow_events" USING "btree" ("org_id", "entity_type", "entity_id");



CREATE INDEX "workflow_events_org_event_occurred_idx" ON "public"."workflow_events" USING "btree" ("org_id", "event_type", "occurred_at" DESC);



CREATE INDEX "workflow_events_org_occurred_idx" ON "public"."workflow_events" USING "btree" ("org_id", "occurred_at" DESC);



CREATE INDEX "workflow_events_payload_gin_idx" ON "public"."workflow_events" USING "gin" ("payload");



CREATE INDEX "workflow_runs_event_id_idx" ON "public"."workflow_runs" USING "btree" ("event_id");



CREATE INDEX "workflow_runs_failed_idx" ON "public"."workflow_runs" USING "btree" ("org_id", "status") WHERE ("status" = 'failed'::"text");



CREATE INDEX "workflow_runs_org_completed_idx" ON "public"."workflow_runs" USING "btree" ("org_id", "completed_at" DESC);



CREATE INDEX "workflow_runs_org_id_idx" ON "public"."workflow_runs" USING "btree" ("org_id");



CREATE INDEX "workflow_runs_org_started_desc" ON "public"."workflow_runs" USING "btree" ("org_id", "started_at" DESC);



CREATE INDEX "workflow_runs_org_started_idx" ON "public"."workflow_runs" USING "btree" ("org_id", "started_at" DESC);



CREATE INDEX "workflow_runs_org_status_started_idx" ON "public"."workflow_runs" USING "btree" ("org_id", "status", "started_at" DESC);



CREATE INDEX "workflow_runs_org_workflow_started_idx" ON "public"."workflow_runs" USING "btree" ("org_id", "workflow_id", "started_at" DESC);



CREATE INDEX "workflow_runs_status_idx" ON "public"."workflow_runs" USING "btree" ("status");



CREATE INDEX "workflows_org_id_idx" ON "public"."workflows" USING "btree" ("org_id");



CREATE UNIQUE INDEX "workflows_org_id_name_uniq" ON "public"."workflows" USING "btree" ("org_id", "name");



CREATE OR REPLACE TRIGGER "jobs_assign_pricing_tier" BEFORE INSERT ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_jobs_assign_pricing_tier"();



CREATE OR REPLACE TRIGGER "jobs_increment_completed_counter" AFTER UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."trg_jobs_increment_completed_counter"();



CREATE OR REPLACE TRIGGER "payments_post_to_ledger" AFTER UPDATE OF "paid_at" ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_post_payment_to_ledger"();



CREATE OR REPLACE TRIGGER "set_discount_applications_updated_at" BEFORE UPDATE ON "public"."discount_applications" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_discount_commitments_updated_at" BEFORE UPDATE ON "public"."discount_commitments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_discount_program_benefits_updated_at" BEFORE UPDATE ON "public"."discount_program_benefits" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_discount_program_commitment_rules_updated_at" BEFORE UPDATE ON "public"."discount_program_commitment_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_discount_program_qualifiers_updated_at" BEFORE UPDATE ON "public"."discount_program_qualifiers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_discount_programs_updated_at" BEFORE UPDATE ON "public"."discount_programs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workflows_updated_at" BEFORE UPDATE ON "public"."workflows" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_app_users_updated_at" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_assignments_updated_at" BEFORE UPDATE ON "public"."assignments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_contacts_updated_at" BEFORE UPDATE ON "public"."contacts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customer_members_updated_at" BEFORE UPDATE ON "public"."customer_members" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customer_person_role_types_updated_at" BEFORE UPDATE ON "public"."customer_person_role_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_customers_updated_at" BEFORE UPDATE ON "public"."customers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_discounts_updated_at" BEFORE UPDATE ON "public"."discounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_documents_updated_at" BEFORE UPDATE ON "public"."documents" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_entity_labels_updated_at" BEFORE UPDATE ON "public"."entity_labels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gl_account_mappings_updated_at" BEFORE UPDATE ON "public"."gl_account_mappings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gl_accounts_updated_at" BEFORE UPDATE ON "public"."gl_accounts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_gl_journal_entries_updated_at" BEFORE UPDATE ON "public"."gl_journal_entries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_industries_updated_at" BEFORE UPDATE ON "public"."industries" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_industry_default_entity_labels_updated_at" BEFORE UPDATE ON "public"."industry_default_entity_labels" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_jobs_updated_at" BEFORE UPDATE ON "public"."jobs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_location_types_updated_at" BEFORE UPDATE ON "public"."location_types" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_locations_parent_same_org" BEFORE INSERT OR UPDATE OF "parent_location_id", "org_id" ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."locations_parent_same_org"();



CREATE OR REPLACE TRIGGER "trg_locations_updated_at" BEFORE UPDATE ON "public"."locations" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_opps_updated_at" BEFORE UPDATE ON "public"."opportunities" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_payments_updated_at" BEFORE UPDATE ON "public"."payments" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_person_relationship_type_settings_updated_at" BEFORE UPDATE ON "public"."person_relationship_type_settings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_completed_schedule_history_rewrite" BEFORE UPDATE ON "public"."schedules" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_completed_schedule_history_rewrite"();



CREATE OR REPLACE TRIGGER "trg_pricing_addons_updated_at" BEFORE UPDATE ON "public"."pricing_addons" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pricing_first_updated_at" BEFORE UPDATE ON "public"."pricing_first_clean_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pricing_freq_updated_at" BEFORE UPDATE ON "public"."pricing_frequencies" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pricing_rec_updated_at" BEFORE UPDATE ON "public"."pricing_recurring_prices" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pricing_services_updated_at" BEFORE UPDATE ON "public"."pricing_services" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_pricing_sqft_updated_at" BEFORE UPDATE ON "public"."pricing_square_footage_tiers" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_quotes_updated_at" BEFORE UPDATE ON "public"."quotes" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_recurrence_updated_at" BEFORE UPDATE ON "public"."recurrence_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_role_definitions_updated_at" BEFORE UPDATE ON "public"."role_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_role_permission_grants_updated_at" BEFORE UPDATE ON "public"."role_permission_grants" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_schedules_updated_at" BEFORE UPDATE ON "public"."schedules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_offerings_updated_at" BEFORE UPDATE ON "public"."service_offerings" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_plan_templates_updated_at" BEFORE UPDATE ON "public"."service_plan_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_service_pricing_rules_updated_at" BEFORE UPDATE ON "public"."service_pricing_rules" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_set_person_full_name" BEFORE INSERT OR UPDATE OF "first_name", "last_name" ON "public"."persons" FOR EACH ROW EXECUTE FUNCTION "public"."set_person_full_name"();



CREATE OR REPLACE TRIGGER "trg_status_definitions_updated_at" BEFORE UPDATE ON "public"."status_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_user_profiles_updated_at" BEFORE UPDATE ON "public"."user_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_vendor_primary_contact_link" AFTER INSERT OR UPDATE OF "primary_contact_id" ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."ensure_vendor_primary_contact_link"();



CREATE OR REPLACE TRIGGER "trg_vendor_users_updated_at" BEFORE UPDATE ON "public"."vendor_users" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_vendors_updated_at" BEFORE UPDATE ON "public"."vendors" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_verticals_updated_at" BEFORE UPDATE ON "public"."verticals" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_workflow_runs_set_org_id" BEFORE INSERT ON "public"."workflow_runs" FOR EACH ROW EXECUTE FUNCTION "public"."workflow_runs_set_org_id"();



ALTER TABLE ONLY "public"."addon_types"
    ADD CONSTRAINT "addon_types_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_assignment_status_id_fkey" FOREIGN KEY ("assignment_status_id") REFERENCES "public"."assignment_statuses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_vendor_user_id_fkey" FOREIGN KEY ("vendor_user_id") REFERENCES "public"."vendor_users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_job_addons"
    ADD CONSTRAINT "cleaning_job_addons_addon_type_id_fkey" FOREIGN KEY ("addon_type_id") REFERENCES "public"."addon_types"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."cleaning_job_addons"
    ADD CONSTRAINT "cleaning_job_addons_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_access_method_id_fkey" FOREIGN KEY ("access_method_id") REFERENCES "public"."access_methods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_addon_frequency_id_fkey" FOREIGN KEY ("addon_frequency_id") REFERENCES "public"."addon_frequencies"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_home_type_id_fkey" FOREIGN KEY ("home_type_id") REFERENCES "public"."home_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_service_type_id_fkey" FOREIGN KEY ("service_type_id") REFERENCES "public"."cleaning_service_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."cleaning_job_details"
    ADD CONSTRAINT "cleaning_job_details_sqft_band_id_fkey" FOREIGN KEY ("sqft_band_id") REFERENCES "public"."sqft_bands"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contact_tags"
    ADD CONSTRAINT "contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "contacts_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_member_contact_roles"
    ADD CONSTRAINT "customer_member_contact_roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_customer_member_id_fkey" FOREIGN KEY ("customer_member_id") REFERENCES "public"."customer_members"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_member_contacts"
    ADD CONSTRAINT "customer_member_contacts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_member_relationship_types"
    ADD CONSTRAINT "customer_member_relationship_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_members"
    ADD CONSTRAINT "customer_members_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_members"
    ADD CONSTRAINT "customer_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_payment_methods"
    ADD CONSTRAINT "customer_payment_methods_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."customer_subscriptions"
    ADD CONSTRAINT "customer_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_subscriptions"
    ADD CONSTRAINT "customer_subscriptions_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."customer_subscriptions"
    ADD CONSTRAINT "customer_subscriptions_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id");



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_tags"
    ADD CONSTRAINT "customer_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."departments"
    ADD CONSTRAINT "departments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_customer_subscription_id_fkey" FOREIGN KEY ("customer_subscription_id") REFERENCES "public"."customer_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_discount_commitment_id_fkey" FOREIGN KEY ("discount_commitment_id") REFERENCES "public"."discount_commitments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_applications"
    ADD CONSTRAINT "discount_applications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_customer_subscription_id_fkey" FOREIGN KEY ("customer_subscription_id") REFERENCES "public"."customer_subscriptions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_granted_application_fkey" FOREIGN KEY ("granted_discount_application_id") REFERENCES "public"."discount_applications"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."discount_commitments"
    ADD CONSTRAINT "discount_commitments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_program_benefits"
    ADD CONSTRAINT "discount_program_benefits_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discount_program_benefits"
    ADD CONSTRAINT "discount_program_benefits_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_program_commitment_rules"
    ADD CONSTRAINT "discount_program_commitment_rules_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discount_program_commitment_rules"
    ADD CONSTRAINT "discount_program_commitment_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_program_qualifiers"
    ADD CONSTRAINT "discount_program_qualifiers_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."discount_program_qualifiers"
    ADD CONSTRAINT "discount_program_qualifiers_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_programs"
    ADD CONSTRAINT "discount_programs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id");



ALTER TABLE ONLY "public"."discount_redemptions"
    ADD CONSTRAINT "discount_redemptions_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id");



ALTER TABLE ONLY "public"."discounts"
    ADD CONSTRAINT "discounts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_field_definitions"
    ADD CONSTRAINT "document_field_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."document_field_values"
    ADD CONSTRAINT "document_field_values_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_field_values"
    ADD CONSTRAINT "document_field_values_field_definition_id_fkey" FOREIGN KEY ("field_definition_id") REFERENCES "public"."document_field_definitions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."document_field_values"
    ADD CONSTRAINT "document_field_values_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."document_versions"
    ADD CONSTRAINT "document_versions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_generated_from_document_id_fkey" FOREIGN KEY ("generated_from_document_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."documents"
    ADD CONSTRAINT "documents_owner_contact_id_fkey" FOREIGN KEY ("owner_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."entity_labels"
    ADD CONSTRAINT "entity_labels_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_definitions"
    ADD CONSTRAINT "field_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_field_definition_id_fkey" FOREIGN KEY ("field_definition_id") REFERENCES "public"."field_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."field_values"
    ADD CONSTRAINT "field_values_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."contacts"
    ADD CONSTRAINT "fk_contacts_person_id" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_members"
    ADD CONSTRAINT "fk_customer_members_person_id" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."customer_person_role_types"
    ADD CONSTRAINT "fk_customer_person_role_types_industry" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_person_role_types"
    ADD CONSTRAINT "fk_customer_person_role_types_vertical" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_persons"
    ADD CONSTRAINT "fk_customer_persons_customer" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_persons"
    ADD CONSTRAINT "fk_customer_persons_person" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "fk_locations_access_method" FOREIGN KEY ("access_method_id") REFERENCES "public"."access_methods"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."person_relationship_type_settings"
    ADD CONSTRAINT "fk_person_relationship_type_settings_industry" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationship_type_settings"
    ADD CONSTRAINT "fk_person_relationship_type_settings_vertical" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "fk_person_relationships_from_person" FOREIGN KEY ("from_person_id") REFERENCES "public"."persons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_relationships"
    ADD CONSTRAINT "fk_person_relationships_to_person" FOREIGN KEY ("to_person_id") REFERENCES "public"."persons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gl_account_mappings"
    ADD CONSTRAINT "gl_account_mappings_gl_account_id_fkey" FOREIGN KEY ("gl_account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_account_mappings"
    ADD CONSTRAINT "gl_account_mappings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_accounts"
    ADD CONSTRAINT "gl_accounts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_journal_entries"
    ADD CONSTRAINT "gl_journal_entries_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_journal_entries"
    ADD CONSTRAINT "gl_journal_entries_reversal_of_entry_id_fkey" FOREIGN KEY ("reversal_of_entry_id") REFERENCES "public"."gl_journal_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "public"."gl_accounts"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_entry_id_fkey" FOREIGN KEY ("entry_id") REFERENCES "public"."gl_journal_entries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."gl_journal_lines"
    ADD CONSTRAINT "gl_journal_lines_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."industry_default_entity_labels"
    ADD CONSTRAINT "industry_default_entity_labels_industry_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_statuses"
    ADD CONSTRAINT "job_statuses_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_tags"
    ADD CONSTRAINT "job_tags_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."job_tags"
    ADD CONSTRAINT "job_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id");



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_job_status_id_fkey" FOREIGN KEY ("job_status_id") REFERENCES "public"."job_statuses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_primary_person_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."persons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."jobs"
    ADD CONSTRAINT "jobs_work_unit_id_fkey" FOREIGN KEY ("work_unit_id") REFERENCES "public"."work_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_journal_entry_id_fkey" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."gl_journal_entries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ledger_transactions"
    ADD CONSTRAINT "ledger_transactions_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."location_tags"
    ADD CONSTRAINT "location_tags_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_tags"
    ADD CONSTRAINT "location_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."location_types"
    ADD CONSTRAINT "location_types_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_location_type_id_fkey" FOREIGN KEY ("location_type_id") REFERENCES "public"."location_types"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_parent_location_id_fkey" FOREIGN KEY ("parent_location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages_outbox"
    ADD CONSTRAINT "messages_outbox_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."messages_outbox"
    ADD CONSTRAINT "messages_outbox_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages_outbox"
    ADD CONSTRAINT "messages_outbox_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."messages"
    ADD CONSTRAINT "messages_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id");



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_discount_program_id_fkey" FOREIGN KEY ("discount_program_id") REFERENCES "public"."discount_programs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_pipeline_stage_id_fkey" FOREIGN KEY ("pipeline_stage_id") REFERENCES "public"."pipeline_stages"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_primary_person_fk" FOREIGN KEY ("primary_person_id") REFERENCES "public"."persons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."opportunities"
    ADD CONSTRAINT "opportunities_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."opportunity_tags"
    ADD CONSTRAINT "opportunity_tags_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."opportunity_tags"
    ADD CONSTRAINT "opportunity_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."org_settings"
    ADD CONSTRAINT "org_settings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orgs"
    ADD CONSTRAINT "orgs_industry_id_fkey" FOREIGN KEY ("industry_id") REFERENCES "public"."industries"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_payment_status_id_fkey" FOREIGN KEY ("payment_status_id") REFERENCES "public"."payment_statuses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."person_locations"
    ADD CONSTRAINT "person_locations_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."person_locations"
    ADD CONSTRAINT "person_locations_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "public"."persons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipeline_stages"
    ADD CONSTRAINT "pipeline_stages_pipeline_id_fkey" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pipelines"
    ADD CONSTRAINT "pipelines_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pricing_addons"
    ADD CONSTRAINT "pricing_addons_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_dimension_values"
    ADD CONSTRAINT "pricing_dimension_values_dimension_id_fkey" FOREIGN KEY ("dimension_id") REFERENCES "public"."pricing_dimensions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_dimension_values"
    ADD CONSTRAINT "pricing_dimension_values_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");



ALTER TABLE ONLY "public"."pricing_dimensions"
    ADD CONSTRAINT "pricing_dimensions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");



ALTER TABLE ONLY "public"."pricing_dimensions"
    ADD CONSTRAINT "pricing_dimensions_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_first_clean_prices"
    ADD CONSTRAINT "pricing_first_clean_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."pricing_services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_first_clean_prices"
    ADD CONSTRAINT "pricing_first_clean_prices_sqft_tier_id_fkey" FOREIGN KEY ("sqft_tier_id") REFERENCES "public"."pricing_square_footage_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_first_clean_prices"
    ADD CONSTRAINT "pricing_first_clean_prices_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_frequencies"
    ADD CONSTRAINT "pricing_frequencies_service_plan_template_id_fkey" FOREIGN KEY ("service_plan_template_id") REFERENCES "public"."service_plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_frequencies"
    ADD CONSTRAINT "pricing_frequencies_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_pricing_dimension_value_id_fkey" FOREIGN KEY ("pricing_dimension_value_id") REFERENCES "public"."pricing_dimension_values"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_pricing_mode_id_fkey" FOREIGN KEY ("pricing_mode_id") REFERENCES "public"."pricing_modes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_service_offering_id_fkey" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_service_plan_template_id_fkey" FOREIGN KEY ("service_plan_template_id") REFERENCES "public"."service_plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_matrix"
    ADD CONSTRAINT "pricing_matrix_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_modes"
    ADD CONSTRAINT "pricing_modes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id");



ALTER TABLE ONLY "public"."pricing_modes"
    ADD CONSTRAINT "pricing_modes_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_recurring_prices"
    ADD CONSTRAINT "pricing_recurring_prices_frequency_id_fkey" FOREIGN KEY ("frequency_id") REFERENCES "public"."pricing_frequencies"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_recurring_prices"
    ADD CONSTRAINT "pricing_recurring_prices_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "public"."pricing_services"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_recurring_prices"
    ADD CONSTRAINT "pricing_recurring_prices_sqft_tier_id_fkey" FOREIGN KEY ("sqft_tier_id") REFERENCES "public"."pricing_square_footage_tiers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_recurring_prices"
    ADD CONSTRAINT "pricing_recurring_prices_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_service_offering_id_fkey" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."pricing_services"
    ADD CONSTRAINT "pricing_services_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pricing_square_footage_tiers"
    ADD CONSTRAINT "pricing_square_footage_tiers_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_opportunity_id_fkey" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."quotes"
    ADD CONSTRAINT "quotes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."recurrence_plans"
    ADD CONSTRAINT "recurrence_plans_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_definitions"
    ADD CONSTRAINT "role_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_permission_key_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permission_keys"("key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_permissions_fkey" FOREIGN KEY ("permission_key") REFERENCES "public"."permissions"("key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_role_definitions_fkey" FOREIGN KEY ("org_id", "role_key") REFERENCES "public"."role_definitions"("org_id", "role_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."role_permission_grants"
    ADD CONSTRAINT "role_permission_grants_role_fk" FOREIGN KEY ("org_id", "role_key") REFERENCES "public"."role_definitions"("org_id", "role_key") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_tags"
    ADD CONSTRAINT "schedule_tags_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedule_tags"
    ADD CONSTRAINT "schedule_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_customer_subscription_id_fkey" FOREIGN KEY ("customer_subscription_id") REFERENCES "public"."customer_subscriptions"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_rescheduled_from_schedule_id_fkey" FOREIGN KEY ("rescheduled_from_schedule_id") REFERENCES "public"."schedules"("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_schedule_status_id_fkey" FOREIGN KEY ("schedule_status_id") REFERENCES "public"."schedule_statuses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_offerings"
    ADD CONSTRAINT "service_offerings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_offerings"
    ADD CONSTRAINT "service_offerings_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_plan_templates"
    ADD CONSTRAINT "service_plan_templates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_plan_templates"
    ADD CONSTRAINT "service_plan_templates_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_price_dimensions"
    ADD CONSTRAINT "service_price_dimensions_pricing_rule_id_fkey" FOREIGN KEY ("pricing_rule_id") REFERENCES "public"."service_pricing_rules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_pricing_rules"
    ADD CONSTRAINT "service_pricing_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."service_pricing_rules"
    ADD CONSTRAINT "service_pricing_rules_service_offering_id_fkey" FOREIGN KEY ("service_offering_id") REFERENCES "public"."service_offerings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."service_pricing_rules"
    ADD CONSTRAINT "service_pricing_rules_service_plan_template_id_fkey" FOREIGN KEY ("service_plan_template_id") REFERENCES "public"."service_plan_templates"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."service_pricing_rules"
    ADD CONSTRAINT "service_pricing_rules_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."status_definitions"
    ADD CONSTRAINT "status_definitions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_profiles"
    ADD CONSTRAINT "user_profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_roles"
    ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_tags"
    ADD CONSTRAINT "vendor_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_tags"
    ADD CONSTRAINT "vendor_tags_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_users"
    ADD CONSTRAINT "vendor_users_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_users"
    ADD CONSTRAINT "vendor_users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vendor_users"
    ADD CONSTRAINT "vendor_users_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_verticals"
    ADD CONSTRAINT "vendor_verticals_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."vendor_verticals"
    ADD CONSTRAINT "vendor_verticals_vertical_id_fkey" FOREIGN KEY ("vertical_id") REFERENCES "public"."verticals"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_drivers_license_doc_file_id_fkey" FOREIGN KEY ("drivers_license_doc_file_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_insurance_doc_file_id_fkey" FOREIGN KEY ("insurance_doc_file_id") REFERENCES "public"."documents"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_primary_contact_id_fkey" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_primary_person_id_fkey" FOREIGN KEY ("primary_person_id") REFERENCES "public"."persons"("id");



ALTER TABLE ONLY "public"."vendors"
    ADD CONSTRAINT "vendors_vendor_status_id_fkey" FOREIGN KEY ("vendor_status_id") REFERENCES "public"."vendor_statuses"("id");



ALTER TABLE ONLY "public"."work_units"
    ADD CONSTRAINT "work_units_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."work_units"
    ADD CONSTRAINT "work_units_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."workflow_action_runs"
    ADD CONSTRAINT "workflow_action_runs_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."workflow_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_action_runs"
    ADD CONSTRAINT "workflow_action_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_action_runs"
    ADD CONSTRAINT "workflow_action_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_action_runs"
    ADD CONSTRAINT "workflow_action_runs_workflow_run_id_fkey" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_runs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_actions"
    ADD CONSTRAINT "workflow_actions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_conditions"
    ADD CONSTRAINT "workflow_conditions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_events"
    ADD CONSTRAINT "workflow_events_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."workflow_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_runs"
    ADD CONSTRAINT "workflow_runs_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."workflows"
    ADD CONSTRAINT "workflows_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE CASCADE;



ALTER TABLE "public"."access_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."action_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "action_links_delete_same_org" ON "public"."action_links" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "action_links_insert_same_org" ON "public"."action_links" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "action_links_select_same_org" ON "public"."action_links" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "action_links_update_same_org" ON "public"."action_links" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."activity_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."addon_frequencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."addon_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_full_access_workflow_actions" ON "public"."workflow_actions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_full_access_workflow_conditions" ON "public"."workflow_conditions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_full_access_workflows" ON "public"."workflows" USING ((EXISTS ( SELECT 1
   FROM "public"."user_profiles" "up"
  WHERE (("up"."id" = "auth"."uid"()) AND ("up"."role" = 'admin'::"public"."app_role")))));



CREATE POLICY "admin_ops_full_access" ON "public"."access_methods" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."activity_log" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."addon_frequencies" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."addon_types" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."assignment_statuses" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."assignments" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."cleaning_job_addons" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."cleaning_job_details" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."cleaning_service_types" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."contact_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."contacts" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."customer_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."customers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."discounts" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."external_mappings" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."home_types" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."job_statuses" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."job_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."jobs" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."location_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."locations" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."messages" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."opportunities" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."opportunity_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."payment_statuses" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."payments" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."pipeline_stages" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."pipelines" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."quotes" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."recurrence_plans" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."schedule_statuses" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."schedule_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."schedules" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."sqft_bands" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."vendor_tags" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."vendor_users" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."vendors" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "admin_ops_full_access" ON "public"."verticals" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_users_admin_write" ON "public"."app_users" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "app_users_read_self_or_admin" ON "public"."app_users" FOR SELECT USING ((("id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))));



ALTER TABLE "public"."assignment_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaning_job_addons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaning_job_details" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."cleaning_service_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "cmrt_modify_admin_ops" ON "public"."customer_member_relationship_types" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "cmrt_select_org_members" ON "public"."customer_member_relationship_types" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id")))));



CREATE POLICY "cmrt_service_role_all" ON "public"."customer_member_relationship_types" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."contact_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "contacts_insert_by_org_role" ON "public"."contacts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "contacts_select_by_org_role" ON "public"."contacts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "contacts_update_by_org_role" ON "public"."contacts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."customer_member_contact_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_member_contact_roles_modify_admin_ops" ON "public"."customer_member_contact_roles" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contact_roles"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contact_roles"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_member_contact_roles_select_org_members" ON "public"."customer_member_contact_roles" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contact_roles"."org_id")))));



CREATE POLICY "customer_member_contact_roles_service_role_all" ON "public"."customer_member_contact_roles" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."customer_member_contacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_member_contacts_modify_admin_ops" ON "public"."customer_member_contacts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contacts"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_member_contacts_select_org_members" ON "public"."customer_member_contacts" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_contacts"."org_id")))));



CREATE POLICY "customer_member_contacts_service_role_all" ON "public"."customer_member_contacts" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."customer_member_relationship_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_member_relationship_types_modify_admin_ops" ON "public"."customer_member_relationship_types" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_member_relationship_types_select_org_members" ON "public"."customer_member_relationship_types" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_member_relationship_types"."org_id")))));



CREATE POLICY "customer_member_relationship_types_service_role_all" ON "public"."customer_member_relationship_types" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."customer_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_members_modify_admin_ops" ON "public"."customer_members" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_members"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_members"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_members_select_org_members" ON "public"."customer_members" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_members"."org_id")))));



CREATE POLICY "customer_members_service_role_all" ON "public"."customer_members" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."customer_payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_person_role_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_person_role_types_delete_by_org_role" ON "public"."customer_person_role_types" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_person_role_types"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "customer_person_role_types_insert_by_org_role" ON "public"."customer_person_role_types" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_person_role_types"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_person_role_types_select_by_org_role" ON "public"."customer_person_role_types" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_person_role_types"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "customer_person_role_types_update_by_org_role" ON "public"."customer_person_role_types" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_person_role_types"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_person_role_types"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."customer_persons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_persons_delete_by_org_role" ON "public"."customer_persons" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "customer_persons_insert_by_org_role" ON "public"."customer_persons" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "customer_persons_select_by_org_role" ON "public"."customer_persons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "customer_persons_update_by_org_role" ON "public"."customer_persons" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "customer_persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."customer_subscriptions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customer_subscriptions_delete_same_org" ON "public"."customer_subscriptions" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "customer_subscriptions_insert_same_org" ON "public"."customer_subscriptions" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "customer_subscriptions_select_same_org" ON "public"."customer_subscriptions" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "customer_subscriptions_update_same_org" ON "public"."customer_subscriptions" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."customer_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_vertical_job_counters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."departments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departments_delete_same_org" ON "public"."departments" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "departments_insert_same_org" ON "public"."departments" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "departments_select_same_org" ON "public"."departments" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "departments_update_same_org" ON "public"."departments" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."discount_applications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_applications_admin_ops_full_access" ON "public"."discount_applications" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_codes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discount_commitments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_commitments_admin_ops_full_access" ON "public"."discount_commitments" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_program_benefits" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_program_benefits_admin_ops_full_access" ON "public"."discount_program_benefits" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_program_commitment_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_program_commitment_rules_admin_ops_full_access" ON "public"."discount_program_commitment_rules" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_program_qualifiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_program_qualifiers_admin_ops_full_access" ON "public"."discount_program_qualifiers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_programs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "discount_programs_admin_ops_full_access" ON "public"."discount_programs" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."discount_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."discounts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."document_field_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_field_definitions_delete_org" ON "public"."document_field_definitions" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "document_field_definitions_insert_org" ON "public"."document_field_definitions" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "document_field_definitions_select_org" ON "public"."document_field_definitions" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "document_field_definitions_update_org" ON "public"."document_field_definitions" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."document_field_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_field_values_delete_org" ON "public"."document_field_values" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "document_field_values_insert_org" ON "public"."document_field_values" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "document_field_values_select_org" ON "public"."document_field_values" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "document_field_values_update_org" ON "public"."document_field_values" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."document_versions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "document_versions_delete_org" ON "public"."document_versions" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "document_versions_insert_org" ON "public"."document_versions" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "document_versions_select_org" ON "public"."document_versions" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "document_versions_update_org" ON "public"."document_versions" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."documents" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "documents_delete_org_admin" ON "public"."documents" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "documents_select_org_admin" ON "public"."documents" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "documents_update_org_admin" ON "public"."documents" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "documents_write_org_admin" ON "public"."documents" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."entity_labels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "entity_labels_modify_admin_ops" ON "public"."entity_labels" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_labels"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_labels"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "entity_labels_select" ON "public"."entity_labels" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "entity_labels_select_org_members" ON "public"."entity_labels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "entity_labels"."org_id")))));



CREATE POLICY "entity_labels_service_role" ON "public"."entity_labels" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."external_mappings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."field_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "field_definitions_delete_by_org_role" ON "public"."field_definitions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "field_definitions_insert_by_org_role" ON "public"."field_definitions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "field_definitions_select_by_org_role" ON "public"."field_definitions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "field_definitions_update_by_org_role" ON "public"."field_definitions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."field_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "field_values_delete_by_org_role" ON "public"."field_values" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_values"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "field_values_insert_by_org_role" ON "public"."field_values" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_values"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "field_values_select_by_org_role" ON "public"."field_values" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_values"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "field_values_update_by_org_role" ON "public"."field_values" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_values"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "field_values"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."gl_account_mappings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gl_account_mappings_delete_same_org" ON "public"."gl_account_mappings" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_account_mappings_insert_same_org" ON "public"."gl_account_mappings" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_account_mappings_select_same_org" ON "public"."gl_account_mappings" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_account_mappings_update_same_org" ON "public"."gl_account_mappings" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."gl_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gl_accounts_delete_same_org" ON "public"."gl_accounts" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_accounts_insert_same_org" ON "public"."gl_accounts" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_accounts_select_same_org" ON "public"."gl_accounts" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_accounts_update_same_org" ON "public"."gl_accounts" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."gl_journal_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gl_journal_entries_delete_same_org" ON "public"."gl_journal_entries" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_entries_insert_same_org" ON "public"."gl_journal_entries" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_entries_select_same_org" ON "public"."gl_journal_entries" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_entries_update_same_org" ON "public"."gl_journal_entries" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."gl_journal_lines" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "gl_journal_lines_delete_same_org" ON "public"."gl_journal_lines" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_lines_insert_same_org" ON "public"."gl_journal_lines" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_lines_select_same_org" ON "public"."gl_journal_lines" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "gl_journal_lines_update_same_org" ON "public"."gl_journal_lines" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."home_types" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."industries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "industries_select" ON "public"."industries" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."industry_default_entity_labels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "industry_default_entity_labels_select" ON "public"."industry_default_entity_labels" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."job_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."job_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ledger_transactions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ledger_transactions_delete_same_org" ON "public"."ledger_transactions" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "ledger_transactions_insert_same_org" ON "public"."ledger_transactions" FOR INSERT TO "authenticated" WITH CHECK (("org_id" = "public"."current_org_id"()));



CREATE POLICY "ledger_transactions_select_same_org" ON "public"."ledger_transactions" FOR SELECT TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "ledger_transactions_update_same_org" ON "public"."ledger_transactions" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK (("org_id" = "public"."current_org_id"()));



ALTER TABLE "public"."location_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."location_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "location_types_modify" ON "public"."location_types" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "location_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "location_types"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "location_types_select" ON "public"."location_types" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "location_types"."org_id")))));



ALTER TABLE "public"."locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."messages_outbox" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "messages_outbox_delete_service_role" ON "public"."messages_outbox" FOR DELETE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "messages_outbox_insert_service_role" ON "public"."messages_outbox" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "messages_outbox_select_org_members" ON "public"."messages_outbox" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "messages_outbox"."org_id")))));



CREATE POLICY "messages_outbox_update_service_role" ON "public"."messages_outbox" FOR UPDATE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."opportunities" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."opportunity_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."org_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "org_settings_delete_org" ON "public"."org_settings" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "org_settings_insert_org" ON "public"."org_settings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "org_settings_select_org" ON "public"."org_settings" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "org_settings_update_org" ON "public"."org_settings" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."orgs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permission_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permission_definitions_delete_service_role" ON "public"."permission_definitions" FOR DELETE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "permission_definitions_insert_service_role" ON "public"."permission_definitions" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "permission_definitions_select" ON "public"."permission_definitions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "permission_definitions_update_service_role" ON "public"."permission_definitions" FOR UPDATE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."permission_keys" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permission_keys_select" ON "public"."permission_keys" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE ("ur"."user_id" = "auth"."uid"()))));



CREATE POLICY "permission_keys_service_role_all" ON "public"."permission_keys" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."permissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permissions_all_service_role" ON "public"."permissions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "permissions_select_authenticated" ON "public"."permissions" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."person_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_locations_delete_org" ON "public"."person_locations" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "person_locations_insert_org" ON "public"."person_locations" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "person_locations_select_org" ON "public"."person_locations" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "person_locations_update_org" ON "public"."person_locations" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."person_relationship_type_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_relationship_type_settings_delete_by_org_role" ON "public"."person_relationship_type_settings" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationship_type_settings"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "person_relationship_type_settings_insert_by_org_role" ON "public"."person_relationship_type_settings" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationship_type_settings"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "person_relationship_type_settings_select_by_org_role" ON "public"."person_relationship_type_settings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationship_type_settings"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "person_relationship_type_settings_update_by_org_role" ON "public"."person_relationship_type_settings" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationship_type_settings"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationship_type_settings"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."person_relationships" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "person_relationships_delete_by_org_role" ON "public"."person_relationships" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationships"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "person_relationships_insert_by_org_role" ON "public"."person_relationships" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationships"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "person_relationships_select_by_org_role" ON "public"."person_relationships" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationships"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "person_relationships_update_by_org_role" ON "public"."person_relationships" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationships"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "person_relationships"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."persons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "persons_delete_by_org_role" ON "public"."persons" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text"]))))));



CREATE POLICY "persons_insert_by_org_role" ON "public"."persons" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "persons_select_by_org_role" ON "public"."persons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]))))));



CREATE POLICY "persons_update_by_org_role" ON "public"."persons" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "persons"."org_id") AND ("ur"."role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))));



ALTER TABLE "public"."pipeline_stages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pipelines" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_addons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_addons_read" ON "public"."pricing_addons" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_addons_write" ON "public"."pricing_addons" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_addons" ON "public"."pricing_addons" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_first_clean" ON "public"."pricing_first_clean_prices" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_frequencies" ON "public"."pricing_frequencies" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_recurring" ON "public"."pricing_recurring_prices" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_services" ON "public"."pricing_services" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_delete_sqft" ON "public"."pricing_square_footage_tiers" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_addons" ON "public"."pricing_addons" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_first_clean" ON "public"."pricing_first_clean_prices" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_frequencies" ON "public"."pricing_frequencies" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_recurring" ON "public"."pricing_recurring_prices" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_services" ON "public"."pricing_services" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_insert_sqft" ON "public"."pricing_square_footage_tiers" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_addons" ON "public"."pricing_addons" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_first_clean" ON "public"."pricing_first_clean_prices" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_frequencies" ON "public"."pricing_frequencies" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_recurring" ON "public"."pricing_recurring_prices" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_services" ON "public"."pricing_services" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_admin_update_sqft" ON "public"."pricing_square_footage_tiers" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



ALTER TABLE "public"."pricing_dimension_values" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_dimension_values_delete_org" ON "public"."pricing_dimension_values" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimension_values_insert_org" ON "public"."pricing_dimension_values" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimension_values_select_org" ON "public"."pricing_dimension_values" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimension_values_update_org" ON "public"."pricing_dimension_values" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."pricing_dimensions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_dimensions_delete_org" ON "public"."pricing_dimensions" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimensions_insert_org" ON "public"."pricing_dimensions" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimensions_select_org" ON "public"."pricing_dimensions" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_dimensions_update_org" ON "public"."pricing_dimensions" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."pricing_first_clean_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_first_read" ON "public"."pricing_first_clean_prices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_first_write" ON "public"."pricing_first_clean_prices" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_freq_read" ON "public"."pricing_frequencies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_freq_write" ON "public"."pricing_frequencies" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



ALTER TABLE "public"."pricing_frequencies" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pricing_matrix" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_matrix_delete_org" ON "public"."pricing_matrix" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_matrix_insert_org" ON "public"."pricing_matrix" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_matrix_select_org" ON "public"."pricing_matrix" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_matrix_update_org" ON "public"."pricing_matrix" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."pricing_modes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_modes_delete_org" ON "public"."pricing_modes" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_modes_insert_org" ON "public"."pricing_modes" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_modes_select_org" ON "public"."pricing_modes" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_modes_update_org" ON "public"."pricing_modes" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "pricing_read_addons" ON "public"."pricing_addons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pricing_read_first_clean" ON "public"."pricing_first_clean_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pricing_read_frequencies" ON "public"."pricing_frequencies" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pricing_read_recurring" ON "public"."pricing_recurring_prices" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pricing_read_services" ON "public"."pricing_services" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "pricing_read_sqft" ON "public"."pricing_square_footage_tiers" FOR SELECT USING ("public"."is_admin"());



ALTER TABLE "public"."pricing_recurring_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_recurring_read" ON "public"."pricing_recurring_prices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_recurring_write" ON "public"."pricing_recurring_prices" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



ALTER TABLE "public"."pricing_services" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "pricing_services_read" ON "public"."pricing_services" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_services_write" ON "public"."pricing_services" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



CREATE POLICY "pricing_sqft_read" ON "public"."pricing_square_footage_tiers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "pricing_sqft_write" ON "public"."pricing_square_footage_tiers" USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'admin'::"text")))));



ALTER TABLE "public"."pricing_square_footage_tiers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_insert_none" ON "public"."user_profiles" FOR INSERT TO "authenticated" WITH CHECK (false);



CREATE POLICY "profiles_select_own" ON "public"."user_profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_update_none" ON "public"."user_profiles" FOR UPDATE TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."quotes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."recurrence_plans" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."role_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_definitions_modify_admin_ops" ON "public"."role_definitions" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_definitions"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "role_definitions_select_org_members" ON "public"."role_definitions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_definitions"."org_id")))));



CREATE POLICY "role_definitions_service_role_all" ON "public"."role_definitions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."role_permission_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "role_permission_grants_modify_admin_ops" ON "public"."role_permission_grants" TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_permission_grants"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))) OR ("auth"."role"() = 'service_role'::"text"))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_permission_grants"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))) OR ("auth"."role"() = 'service_role'::"text")));



CREATE POLICY "role_permission_grants_select_org_members" ON "public"."role_permission_grants" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "role_permission_grants"."org_id")))));



CREATE POLICY "role_permission_grants_service_role_all" ON "public"."role_permission_grants" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."schedule_statuses" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedule_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."schedules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service role full access action_links" ON "public"."action_links" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access customer_subscriptions" ON "public"."customer_subscriptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access departments" ON "public"."departments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service role full access work_units" ON "public"."work_units" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."service_offerings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_offerings_delete_org" ON "public"."service_offerings" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_offerings_insert_org" ON "public"."service_offerings" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_offerings_select_org" ON "public"."service_offerings" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_offerings_update_org" ON "public"."service_offerings" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."service_plan_templates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_plan_templates_delete_org" ON "public"."service_plan_templates" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_plan_templates_insert_org" ON "public"."service_plan_templates" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_plan_templates_select_org" ON "public"."service_plan_templates" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_plan_templates_update_org" ON "public"."service_plan_templates" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



ALTER TABLE "public"."service_price_dimensions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_price_dimensions_delete_org" ON "public"."service_price_dimensions" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."service_pricing_rules" "spr"
  WHERE (("spr"."id" = "service_price_dimensions"."pricing_rule_id") AND "public"."user_belongs_to_org"("spr"."org_id")))));



CREATE POLICY "service_price_dimensions_insert_org" ON "public"."service_price_dimensions" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."service_pricing_rules" "spr"
  WHERE (("spr"."id" = "service_price_dimensions"."pricing_rule_id") AND "public"."user_belongs_to_org"("spr"."org_id")))));



CREATE POLICY "service_price_dimensions_select_org" ON "public"."service_price_dimensions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."service_pricing_rules" "spr"
  WHERE (("spr"."id" = "service_price_dimensions"."pricing_rule_id") AND "public"."user_belongs_to_org"("spr"."org_id")))));



CREATE POLICY "service_price_dimensions_update_org" ON "public"."service_price_dimensions" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."service_pricing_rules" "spr"
  WHERE (("spr"."id" = "service_price_dimensions"."pricing_rule_id") AND "public"."user_belongs_to_org"("spr"."org_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."service_pricing_rules" "spr"
  WHERE (("spr"."id" = "service_price_dimensions"."pricing_rule_id") AND "public"."user_belongs_to_org"("spr"."org_id")))));



ALTER TABLE "public"."service_pricing_rules" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "service_pricing_rules_delete_org" ON "public"."service_pricing_rules" FOR DELETE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_pricing_rules_insert_org" ON "public"."service_pricing_rules" FOR INSERT TO "authenticated" WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_pricing_rules_select_org" ON "public"."service_pricing_rules" FOR SELECT TO "authenticated" USING ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_pricing_rules_update_org" ON "public"."service_pricing_rules" FOR UPDATE TO "authenticated" USING ("public"."user_belongs_to_org"("org_id")) WITH CHECK ("public"."user_belongs_to_org"("org_id"));



CREATE POLICY "service_role_all_discount_codes" ON "public"."discount_codes" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_all_discount_redemptions" ON "public"."discount_redemptions" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_applications" ON "public"."discount_applications" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_commitments" ON "public"."discount_commitments" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_program_benefits" ON "public"."discount_program_benefits" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_program_commitment_rules" ON "public"."discount_program_commitment_rules" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_program_qualifiers" ON "public"."discount_program_qualifiers" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_discount_programs" ON "public"."discount_programs" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_gl_account_mappings" ON "public"."gl_account_mappings" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_gl_accounts" ON "public"."gl_accounts" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_gl_journal_entries" ON "public"."gl_journal_entries" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_gl_journal_lines" ON "public"."gl_journal_lines" TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "service_role_full_access_ledger_transactions" ON "public"."ledger_transactions" TO "service_role" USING (true) WITH CHECK (true);



ALTER TABLE "public"."sqft_bands" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."status_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "status_definitions_modify_admin_only" ON "public"."status_definitions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "status_definitions"."org_id") AND ("ur"."role" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "status_definitions"."org_id") AND ("ur"."role" = 'admin'::"text")))));



CREATE POLICY "status_definitions_select_org_members" ON "public"."status_definitions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "status_definitions"."org_id")))));



CREATE POLICY "status_definitions_service_role_all" ON "public"."status_definitions" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."user_roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "user_roles_select_org_admin" ON "public"."user_roles" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "user_roles_write_org_owner" ON "public"."user_roles" TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text"]));



ALTER TABLE "public"."vendor_statuses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_statuses_select_authenticated" ON "public"."vendor_statuses" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."vendor_tags" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."vendor_verticals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendor_verticals_select_org_admin" ON "public"."vendor_verticals" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vendors" "v"
  WHERE (("v"."id" = "vendor_verticals"."vendor_id") AND "public"."has_org_role"("v"."org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"])))));



CREATE POLICY "vendor_verticals_write_org_admin" ON "public"."vendor_verticals" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."vendors" "v"
  WHERE (("v"."id" = "vendor_verticals"."vendor_id") AND "public"."has_org_role"("v"."org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."vendors" "v"
  WHERE (("v"."id" = "vendor_verticals"."vendor_id") AND "public"."has_org_role"("v"."org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])))));



ALTER TABLE "public"."vendors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "vendors_delete_org_admin" ON "public"."vendors" FOR DELETE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text"]));



CREATE POLICY "vendors_select_org_admin" ON "public"."vendors" FOR SELECT TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text", 'manager'::"text"]));



CREATE POLICY "vendors_update_org_admin" ON "public"."vendors" FOR UPDATE TO "authenticated" USING ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"])) WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



CREATE POLICY "vendors_write_org_admin" ON "public"."vendors" FOR INSERT TO "authenticated" WITH CHECK ("public"."has_org_role"("org_id", ARRAY['owner'::"text", 'admin'::"text", 'ops'::"text"]));



ALTER TABLE "public"."verticals" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."work_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "work_units_delete_same_org" ON "public"."work_units" FOR DELETE TO "authenticated" USING (("org_id" = "public"."current_org_id"()));



CREATE POLICY "work_units_insert_same_org" ON "public"."work_units" FOR INSERT TO "authenticated" WITH CHECK ((("org_id" = "public"."current_org_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."departments" "d"
  WHERE (("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "d"."org_id"))))));



CREATE POLICY "work_units_select_same_org" ON "public"."work_units" FOR SELECT TO "authenticated" USING ((("org_id" = "public"."current_org_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."departments" "d"
  WHERE (("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "work_units"."org_id"))))));



CREATE POLICY "work_units_update_same_org" ON "public"."work_units" FOR UPDATE TO "authenticated" USING (("org_id" = "public"."current_org_id"())) WITH CHECK ((("org_id" = "public"."current_org_id"()) AND (EXISTS ( SELECT 1
   FROM "public"."departments" "d"
  WHERE (("d"."id" = "work_units"."department_id") AND ("d"."org_id" = "d"."org_id"))))));



ALTER TABLE "public"."workflow_action_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_action_runs_delete_service_role" ON "public"."workflow_action_runs" FOR DELETE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "workflow_action_runs_insert_service_role" ON "public"."workflow_action_runs" FOR INSERT TO "authenticated" WITH CHECK (("auth"."role"() = 'service_role'::"text"));



CREATE POLICY "workflow_action_runs_select_org_members" ON "public"."workflow_action_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_action_runs"."org_id")))));



CREATE POLICY "workflow_action_runs_update_service_role" ON "public"."workflow_action_runs" FOR UPDATE TO "authenticated" USING (("auth"."role"() = 'service_role'::"text")) WITH CHECK (("auth"."role"() = 'service_role'::"text"));



ALTER TABLE "public"."workflow_actions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_conditions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_events_modify" ON "public"."workflow_events" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_events"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_events"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "workflow_events_no_client_write" ON "public"."workflow_events" TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "workflow_events_select" ON "public"."workflow_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_events"."org_id")))));



CREATE POLICY "workflow_events_select_org" ON "public"."workflow_events" FOR SELECT TO "authenticated" USING ("public"."is_org_member"("org_id"));



ALTER TABLE "public"."workflow_runs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_runs_modify" ON "public"."workflow_runs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_runs"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_runs"."org_id") AND ("ur"."role" = ANY (ARRAY['admin'::"text", 'ops'::"text"]))))));



CREATE POLICY "workflow_runs_select" ON "public"."workflow_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."user_roles" "ur"
  WHERE (("ur"."user_id" = "auth"."uid"()) AND ("ur"."org_id" = "workflow_runs"."org_id")))));



ALTER TABLE "public"."workflows" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "admin"."wipe_org_data"("p_org_id" "uuid", "p_confirm" "text", "p_include_workflows" boolean) FROM PUBLIC;

























































































































































GRANT ALL ON FUNCTION "public"."current_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_org_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."discounted_cents"("base_cents" integer, "pct" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."discounted_cents"("base_cents" integer, "pct" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."discounted_cents"("base_cents" integer, "pct" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."ensure_vendor_primary_contact_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."ensure_vendor_primary_contact_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."ensure_vendor_primary_contact_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."fn_job_split_bps"("p_job_number" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."fn_job_split_bps"("p_job_number" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."fn_job_split_bps"("p_job_number" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_quote_pricing"("p_vertical_slug" "text", "p_service_key" "text", "p_sqft_key" "text", "p_frequency_key" "text", "p_addon_keys" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."has_org_role"("_org_id" "uuid", "_roles" "text"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."has_org_role"("_org_id" "uuid", "_roles" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_org_role"("_org_id" "uuid", "_roles" "text"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_org_member"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."locations_parent_same_org"() TO "anon";
GRANT ALL ON FUNCTION "public"."locations_parent_same_org"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."locations_parent_same_org"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_ledger_transaction"("p_ledger_tx_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."post_payment_to_ledger"("payment_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_completed_schedule_history_rewrite"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_completed_schedule_history_rewrite"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_completed_schedule_history_rewrite"() TO "service_role";



GRANT ALL ON FUNCTION "public"."round_to_nearest_5_cents"("p_cents" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."round_to_nearest_5_cents"("p_cents" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."round_to_nearest_5_cents"("p_cents" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."scaled_base_cents"("old_dollars" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."scaled_base_cents"("old_dollars" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."scaled_base_cents"("old_dollars" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_default_rbac"("p_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."seed_default_rbac"("p_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_default_rbac"("p_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_person_full_name"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_person_full_name"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_person_full_name"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_jobs_assign_pricing_tier"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_jobs_assign_pricing_tier"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_jobs_assign_pricing_tier"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_jobs_increment_completed_counter"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_jobs_increment_completed_counter"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_jobs_increment_completed_counter"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_post_payment_to_ledger"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_post_payment_to_ledger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_post_payment_to_ledger"() TO "service_role";



GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("target_org_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("target_org_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."user_belongs_to_org"("target_org_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."workflow_runs_set_org_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."workflow_runs_set_org_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."workflow_runs_set_org_id"() TO "service_role";


















GRANT ALL ON TABLE "public"."access_methods" TO "anon";
GRANT ALL ON TABLE "public"."access_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."access_methods" TO "service_role";



GRANT ALL ON TABLE "public"."action_links" TO "anon";
GRANT ALL ON TABLE "public"."action_links" TO "authenticated";
GRANT ALL ON TABLE "public"."action_links" TO "service_role";



GRANT ALL ON TABLE "public"."activity_log" TO "anon";
GRANT ALL ON TABLE "public"."activity_log" TO "authenticated";
GRANT ALL ON TABLE "public"."activity_log" TO "service_role";



GRANT ALL ON TABLE "public"."addon_frequencies" TO "anon";
GRANT ALL ON TABLE "public"."addon_frequencies" TO "authenticated";
GRANT ALL ON TABLE "public"."addon_frequencies" TO "service_role";



GRANT ALL ON TABLE "public"."addon_types" TO "anon";
GRANT ALL ON TABLE "public"."addon_types" TO "authenticated";
GRANT ALL ON TABLE "public"."addon_types" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_statuses" TO "anon";
GRANT ALL ON TABLE "public"."assignment_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."cleaning_job_addons" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_job_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_job_addons" TO "service_role";



GRANT ALL ON TABLE "public"."cleaning_job_details" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_job_details" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_job_details" TO "service_role";



GRANT ALL ON TABLE "public"."cleaning_service_types" TO "anon";
GRANT ALL ON TABLE "public"."cleaning_service_types" TO "authenticated";
GRANT ALL ON TABLE "public"."cleaning_service_types" TO "service_role";



GRANT ALL ON TABLE "public"."contact_tags" TO "anon";
GRANT ALL ON TABLE "public"."contact_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."contact_tags" TO "service_role";



GRANT ALL ON TABLE "public"."contacts" TO "anon";
GRANT ALL ON TABLE "public"."contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."contacts" TO "service_role";



GRANT ALL ON TABLE "public"."customer_member_contact_roles" TO "anon";
GRANT ALL ON TABLE "public"."customer_member_contact_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_member_contact_roles" TO "service_role";



GRANT ALL ON TABLE "public"."customer_member_contacts" TO "anon";
GRANT ALL ON TABLE "public"."customer_member_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_member_contacts" TO "service_role";



GRANT ALL ON TABLE "public"."customer_member_relationship_types" TO "anon";
GRANT ALL ON TABLE "public"."customer_member_relationship_types" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_member_relationship_types" TO "service_role";



GRANT ALL ON TABLE "public"."customer_members" TO "anon";
GRANT ALL ON TABLE "public"."customer_members" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_members" TO "service_role";



GRANT ALL ON TABLE "public"."customer_payment_methods" TO "anon";
GRANT ALL ON TABLE "public"."customer_payment_methods" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_payment_methods" TO "service_role";



GRANT ALL ON TABLE "public"."customer_person_role_types" TO "anon";
GRANT ALL ON TABLE "public"."customer_person_role_types" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_person_role_types" TO "service_role";



GRANT ALL ON TABLE "public"."customer_persons" TO "anon";
GRANT ALL ON TABLE "public"."customer_persons" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_persons" TO "service_role";



GRANT ALL ON TABLE "public"."customer_subscriptions" TO "anon";
GRANT ALL ON TABLE "public"."customer_subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_subscriptions" TO "service_role";



GRANT ALL ON TABLE "public"."customer_tags" TO "anon";
GRANT ALL ON TABLE "public"."customer_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_tags" TO "service_role";



GRANT ALL ON TABLE "public"."customer_vertical_job_counters" TO "anon";
GRANT ALL ON TABLE "public"."customer_vertical_job_counters" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_vertical_job_counters" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."departments" TO "anon";
GRANT ALL ON TABLE "public"."departments" TO "authenticated";
GRANT ALL ON TABLE "public"."departments" TO "service_role";



GRANT ALL ON TABLE "public"."discount_applications" TO "anon";
GRANT ALL ON TABLE "public"."discount_applications" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_applications" TO "service_role";



GRANT ALL ON TABLE "public"."discount_codes" TO "anon";
GRANT ALL ON TABLE "public"."discount_codes" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_codes" TO "service_role";



GRANT ALL ON TABLE "public"."discount_commitments" TO "anon";
GRANT ALL ON TABLE "public"."discount_commitments" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_commitments" TO "service_role";



GRANT ALL ON TABLE "public"."discount_program_benefits" TO "anon";
GRANT ALL ON TABLE "public"."discount_program_benefits" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_program_benefits" TO "service_role";



GRANT ALL ON TABLE "public"."discount_program_commitment_rules" TO "anon";
GRANT ALL ON TABLE "public"."discount_program_commitment_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_program_commitment_rules" TO "service_role";



GRANT ALL ON TABLE "public"."discount_program_qualifiers" TO "anon";
GRANT ALL ON TABLE "public"."discount_program_qualifiers" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_program_qualifiers" TO "service_role";



GRANT ALL ON TABLE "public"."discount_programs" TO "anon";
GRANT ALL ON TABLE "public"."discount_programs" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_programs" TO "service_role";



GRANT ALL ON TABLE "public"."discount_programs_admin_v" TO "anon";
GRANT ALL ON TABLE "public"."discount_programs_admin_v" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_programs_admin_v" TO "service_role";



GRANT ALL ON TABLE "public"."discount_redemptions" TO "anon";
GRANT ALL ON TABLE "public"."discount_redemptions" TO "authenticated";
GRANT ALL ON TABLE "public"."discount_redemptions" TO "service_role";



GRANT ALL ON TABLE "public"."discounts" TO "anon";
GRANT ALL ON TABLE "public"."discounts" TO "authenticated";
GRANT ALL ON TABLE "public"."discounts" TO "service_role";



GRANT ALL ON TABLE "public"."document_field_definitions" TO "anon";
GRANT ALL ON TABLE "public"."document_field_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_field_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."document_field_values" TO "anon";
GRANT ALL ON TABLE "public"."document_field_values" TO "authenticated";
GRANT ALL ON TABLE "public"."document_field_values" TO "service_role";



GRANT ALL ON TABLE "public"."document_versions" TO "anon";
GRANT ALL ON TABLE "public"."document_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."document_versions" TO "service_role";



GRANT ALL ON TABLE "public"."documents" TO "anon";
GRANT ALL ON TABLE "public"."documents" TO "authenticated";
GRANT ALL ON TABLE "public"."documents" TO "service_role";



GRANT ALL ON TABLE "public"."entity_labels" TO "anon";
GRANT ALL ON TABLE "public"."entity_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."entity_labels" TO "service_role";



GRANT ALL ON TABLE "public"."external_mappings" TO "anon";
GRANT ALL ON TABLE "public"."external_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."external_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."field_definitions" TO "anon";
GRANT ALL ON TABLE "public"."field_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."field_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."field_values" TO "anon";
GRANT ALL ON TABLE "public"."field_values" TO "authenticated";
GRANT ALL ON TABLE "public"."field_values" TO "service_role";



GRANT ALL ON TABLE "public"."gl_account_mappings" TO "anon";
GRANT ALL ON TABLE "public"."gl_account_mappings" TO "authenticated";
GRANT ALL ON TABLE "public"."gl_account_mappings" TO "service_role";



GRANT ALL ON TABLE "public"."gl_accounts" TO "anon";
GRANT ALL ON TABLE "public"."gl_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."gl_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."gl_journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."gl_journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."gl_journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."gl_journal_lines" TO "anon";
GRANT ALL ON TABLE "public"."gl_journal_lines" TO "authenticated";
GRANT ALL ON TABLE "public"."gl_journal_lines" TO "service_role";



GRANT ALL ON TABLE "public"."home_types" TO "anon";
GRANT ALL ON TABLE "public"."home_types" TO "authenticated";
GRANT ALL ON TABLE "public"."home_types" TO "service_role";



GRANT ALL ON TABLE "public"."industries" TO "anon";
GRANT ALL ON TABLE "public"."industries" TO "authenticated";
GRANT ALL ON TABLE "public"."industries" TO "service_role";



GRANT ALL ON TABLE "public"."industry_default_entity_labels" TO "anon";
GRANT ALL ON TABLE "public"."industry_default_entity_labels" TO "authenticated";
GRANT ALL ON TABLE "public"."industry_default_entity_labels" TO "service_role";



GRANT ALL ON TABLE "public"."job_statuses" TO "anon";
GRANT ALL ON TABLE "public"."job_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."job_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."job_tags" TO "anon";
GRANT ALL ON TABLE "public"."job_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."job_tags" TO "service_role";



GRANT ALL ON TABLE "public"."jobs" TO "anon";
GRANT ALL ON TABLE "public"."jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."jobs" TO "service_role";



GRANT ALL ON TABLE "public"."ledger_transactions" TO "anon";
GRANT ALL ON TABLE "public"."ledger_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."ledger_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."location_tags" TO "anon";
GRANT ALL ON TABLE "public"."location_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."location_tags" TO "service_role";



GRANT ALL ON TABLE "public"."location_types" TO "anon";
GRANT ALL ON TABLE "public"."location_types" TO "authenticated";
GRANT ALL ON TABLE "public"."location_types" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."messages" TO "anon";
GRANT ALL ON TABLE "public"."messages" TO "authenticated";
GRANT ALL ON TABLE "public"."messages" TO "service_role";



GRANT ALL ON TABLE "public"."messages_outbox" TO "anon";
GRANT ALL ON TABLE "public"."messages_outbox" TO "authenticated";
GRANT ALL ON TABLE "public"."messages_outbox" TO "service_role";



GRANT ALL ON TABLE "public"."opportunities" TO "anon";
GRANT ALL ON TABLE "public"."opportunities" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunities" TO "service_role";



GRANT ALL ON TABLE "public"."opportunity_tags" TO "anon";
GRANT ALL ON TABLE "public"."opportunity_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."opportunity_tags" TO "service_role";



GRANT ALL ON TABLE "public"."org_settings" TO "anon";
GRANT ALL ON TABLE "public"."org_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."org_settings" TO "service_role";



GRANT ALL ON TABLE "public"."orgs" TO "anon";
GRANT ALL ON TABLE "public"."orgs" TO "authenticated";
GRANT ALL ON TABLE "public"."orgs" TO "service_role";



GRANT ALL ON TABLE "public"."payment_statuses" TO "anon";
GRANT ALL ON TABLE "public"."payment_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."payment_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."permission_definitions" TO "anon";
GRANT ALL ON TABLE "public"."permission_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."permission_keys" TO "anon";
GRANT ALL ON TABLE "public"."permission_keys" TO "authenticated";
GRANT ALL ON TABLE "public"."permission_keys" TO "service_role";



GRANT ALL ON TABLE "public"."permissions" TO "anon";
GRANT ALL ON TABLE "public"."permissions" TO "authenticated";
GRANT ALL ON TABLE "public"."permissions" TO "service_role";



GRANT ALL ON TABLE "public"."person_locations" TO "anon";
GRANT ALL ON TABLE "public"."person_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."person_locations" TO "service_role";



GRANT ALL ON TABLE "public"."person_relationship_type_settings" TO "anon";
GRANT ALL ON TABLE "public"."person_relationship_type_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."person_relationship_type_settings" TO "service_role";



GRANT ALL ON TABLE "public"."person_relationships" TO "anon";
GRANT ALL ON TABLE "public"."person_relationships" TO "authenticated";
GRANT ALL ON TABLE "public"."person_relationships" TO "service_role";



GRANT ALL ON TABLE "public"."persons" TO "anon";
GRANT ALL ON TABLE "public"."persons" TO "authenticated";
GRANT ALL ON TABLE "public"."persons" TO "service_role";



GRANT ALL ON TABLE "public"."pipeline_stages" TO "anon";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "authenticated";
GRANT ALL ON TABLE "public"."pipeline_stages" TO "service_role";



GRANT ALL ON TABLE "public"."pipelines" TO "anon";
GRANT ALL ON TABLE "public"."pipelines" TO "authenticated";
GRANT ALL ON TABLE "public"."pipelines" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_addons" TO "anon";
GRANT ALL ON TABLE "public"."pricing_addons" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_addons" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_dimension_values" TO "anon";
GRANT ALL ON TABLE "public"."pricing_dimension_values" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_dimension_values" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."pricing_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_dimensions" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_first_clean_prices" TO "anon";
GRANT ALL ON TABLE "public"."pricing_first_clean_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_first_clean_prices" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_frequencies" TO "anon";
GRANT ALL ON TABLE "public"."pricing_frequencies" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_frequencies" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_matrix" TO "anon";
GRANT ALL ON TABLE "public"."pricing_matrix" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_matrix" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_modes" TO "anon";
GRANT ALL ON TABLE "public"."pricing_modes" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_modes" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_recurring_prices" TO "anon";
GRANT ALL ON TABLE "public"."pricing_recurring_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_recurring_prices" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_services" TO "anon";
GRANT ALL ON TABLE "public"."pricing_services" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_services" TO "service_role";



GRANT ALL ON TABLE "public"."pricing_square_footage_tiers" TO "anon";
GRANT ALL ON TABLE "public"."pricing_square_footage_tiers" TO "authenticated";
GRANT ALL ON TABLE "public"."pricing_square_footage_tiers" TO "service_role";



GRANT ALL ON TABLE "public"."quotes" TO "anon";
GRANT ALL ON TABLE "public"."quotes" TO "authenticated";
GRANT ALL ON TABLE "public"."quotes" TO "service_role";



GRANT ALL ON TABLE "public"."recurrence_plans" TO "anon";
GRANT ALL ON TABLE "public"."recurrence_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."recurrence_plans" TO "service_role";



GRANT ALL ON TABLE "public"."role_definitions" TO "anon";
GRANT ALL ON TABLE "public"."role_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."role_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."role_permission_grants" TO "anon";
GRANT ALL ON TABLE "public"."role_permission_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."role_permission_grants" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_statuses" TO "anon";
GRANT ALL ON TABLE "public"."schedule_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."schedule_tags" TO "anon";
GRANT ALL ON TABLE "public"."schedule_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."schedule_tags" TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON TABLE "public"."service_offerings" TO "anon";
GRANT ALL ON TABLE "public"."service_offerings" TO "authenticated";
GRANT ALL ON TABLE "public"."service_offerings" TO "service_role";



GRANT ALL ON TABLE "public"."service_plan_templates" TO "anon";
GRANT ALL ON TABLE "public"."service_plan_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."service_plan_templates" TO "service_role";



GRANT ALL ON TABLE "public"."service_price_dimensions" TO "anon";
GRANT ALL ON TABLE "public"."service_price_dimensions" TO "authenticated";
GRANT ALL ON TABLE "public"."service_price_dimensions" TO "service_role";



GRANT ALL ON TABLE "public"."service_pricing_rules" TO "anon";
GRANT ALL ON TABLE "public"."service_pricing_rules" TO "authenticated";
GRANT ALL ON TABLE "public"."service_pricing_rules" TO "service_role";



GRANT ALL ON TABLE "public"."sqft_bands" TO "anon";
GRANT ALL ON TABLE "public"."sqft_bands" TO "authenticated";
GRANT ALL ON TABLE "public"."sqft_bands" TO "service_role";



GRANT ALL ON TABLE "public"."status_definitions" TO "anon";
GRANT ALL ON TABLE "public"."status_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."status_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."tags" TO "anon";
GRANT ALL ON TABLE "public"."tags" TO "authenticated";
GRANT ALL ON TABLE "public"."tags" TO "service_role";



GRANT ALL ON TABLE "public"."user_profiles" TO "anon";
GRANT ALL ON TABLE "public"."user_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_profiles" TO "service_role";



GRANT ALL ON TABLE "public"."user_roles" TO "anon";
GRANT ALL ON TABLE "public"."user_roles" TO "authenticated";
GRANT ALL ON TABLE "public"."user_roles" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_statuses" TO "anon";
GRANT ALL ON TABLE "public"."vendor_statuses" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_statuses" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_tags" TO "anon";
GRANT ALL ON TABLE "public"."vendor_tags" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_tags" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_users" TO "anon";
GRANT ALL ON TABLE "public"."vendor_users" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_users" TO "service_role";



GRANT ALL ON TABLE "public"."vendor_verticals" TO "anon";
GRANT ALL ON TABLE "public"."vendor_verticals" TO "authenticated";
GRANT ALL ON TABLE "public"."vendor_verticals" TO "service_role";



GRANT ALL ON TABLE "public"."vendors" TO "anon";
GRANT ALL ON TABLE "public"."vendors" TO "authenticated";
GRANT ALL ON TABLE "public"."vendors" TO "service_role";



GRANT ALL ON TABLE "public"."verticals" TO "anon";
GRANT ALL ON TABLE "public"."verticals" TO "authenticated";
GRANT ALL ON TABLE "public"."verticals" TO "service_role";



GRANT ALL ON TABLE "public"."work_units" TO "anon";
GRANT ALL ON TABLE "public"."work_units" TO "authenticated";
GRANT ALL ON TABLE "public"."work_units" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_action_runs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_action_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_action_runs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_actions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_actions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_conditions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_conditions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_conditions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_events" TO "anon";
GRANT ALL ON TABLE "public"."workflow_events" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_events" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_runs" TO "anon";
GRANT ALL ON TABLE "public"."workflow_runs" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_runs" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_run_events" TO "anon";
GRANT ALL ON TABLE "public"."workflow_run_events" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_run_events" TO "service_role";



GRANT ALL ON TABLE "public"."workflows" TO "anon";
GRANT ALL ON TABLE "public"."workflows" TO "authenticated";
GRANT ALL ON TABLE "public"."workflows" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";



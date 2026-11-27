-- RO1 harness, step 1 of a case database's platform: what a hosted project's `postgres` database has before any
-- Alloy migration, minus everything cluster-wide. Run as supabase_admin in the throwaway database, before GoTrue's and
-- Storage's own migrations. Every statement here is local to that database: no CREATE/ALTER ROLE, no GRANT of a role,
-- nothing on another database. The schemas, owners and grants copy what the shared stack's `postgres` database shows
-- (the image's init-scripts and migrations, supabase/postgres 17.6.1.165); the pg_net event trigger is the image's own
-- current version (migrations/20250220051611_pg_net_perms_fix.sql).
create schema if not exists extensions authorization postgres;
grant usage on schema extensions to dashboard_user;
grant create on schema extensions to dashboard_user;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant usage on schema extensions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
create publication supabase_realtime;
alter publication supabase_realtime owner to postgres;
create schema if not exists auth authorization supabase_admin;
grant usage, create on schema auth to supabase_auth_admin, dashboard_user;
grant usage on schema auth to anon, authenticated, service_role, postgres;
create schema if not exists storage authorization supabase_admin;
grant usage on schema storage to anon, authenticated, service_role;
grant usage on schema storage to postgres with grant option;
grant all on schema storage to supabase_storage_admin with grant option;
grant all on schema storage to dashboard_user;
alter default privileges in schema storage grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema storage grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema storage grant all on sequences to postgres, anon, authenticated, service_role;
create schema if not exists graphql;
create extension if not exists pg_graphql with schema graphql;
grant usage on schema graphql to anon, authenticated, service_role;
grant usage on schema graphql to postgres with grant option;
create schema if not exists vault;
create extension if not exists supabase_vault with schema vault;
create schema if not exists realtime;
grant usage on schema realtime to anon, authenticated, service_role;
grant usage on schema realtime to postgres with grant option;

CREATE OR REPLACE FUNCTION extensions.grant_pg_net_access()
RETURNS event_trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;
do $$ begin
  if not exists (select 1 from pg_event_trigger where evtname = 'issue_pg_net_access') then
    create event trigger issue_pg_net_access on ddl_command_end when tag in ('CREATE EXTENSION') execute procedure extensions.grant_pg_net_access();
  end if;
end $$;

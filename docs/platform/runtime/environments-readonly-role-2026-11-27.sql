-- Alloy read-only role `alloy_readonly` (ALY-14, objective WALDEN_ENVIRONMENTS_AND_PROMOTION_B9E42B66, slice RO1).
--
-- WHAT IT IS FOR
--   The release tool's read paths (`emit-sql ledger`, `ledger-if-present`, `fingerprint`, `census`, `orgs`) and the
--   step-6 export connect as this role:
--     PRODUCTION_DB_URL_READONLY  the new project tjziptdknxdajzauctha
--     STAGING_DB_URL_READONLY     staging ikaxilmwmrmbagoidedu
--   One script for both projects. The owner pastes it into each project's SQL Editor and runs it. Running it again is
--   safe: it changes nothing that is already right, and it never touches the role's password.
--   Plan: docs/platform/runtime/environments-final-cutover-plan-2026-11-26.md, step 5.
--   Evidence: docs/platform/runtime/environments-ro1-evidence-2026-11-27/.
--
-- OWNER EXCEPTION (2026-11-26, plan O-READONLY)
--   The role has BYPASSRLS: it reads EVERY tenant's rows, the same as `postgres` does. The owner accepted this
--   explicitly on 2026-11-26, after the Database Engineer's review, so that the census, the orgs list and the step-6
--   export run through this dedicated login. It never writes (below). Its password lives only in the owner's secret
--   store. FOLLOW-UP: on production, switch the role off (NOLOGIN) or narrow it (NOBYPASSRLS) before the first tenant
--   with live customer data (families, attendance or billing) goes live.
--
-- WHAT IT DOES
--   1. Creates the LOGIN role `alloy_readonly` with NO password. The owner sets the password afterwards, outside the
--      SQL Editor (owner dashboard guide, step 5). Until then the role cannot sign in.
--   2. Sets the role's sessions to read-only (default_transaction_read_only = on), a 120 s statement_timeout, a 5 s
--      lock_timeout, a 60 s idle_in_transaction_session_timeout and row_security = off (3), and allows at most 5
--      connections.
--   3. Gives it BYPASSRLS (the owner exception above), so that the census counts, the fingerprint, the orgs list and
--      the export see every row, the same as `postgres` does. Every public table has RLS on, and no policy names this
--      role. Its sessions also have row_security = off: if BYPASSRLS were ever missing, a read that reaches rows behind
--      RLS stops with `ERROR: query would be affected by row-level security policy for table …` instead of quietly
--      reading 0 rows and an empty export (evidence README, section 1).
--   4. Grants USAGE and SELECT, and nothing else, on:
--        public                   every table and view (ledger-free queries, census, orgs, export, fingerprint)
--        supabase_migrations      the ledger (ledger, ledger-if-present); the schema is created here, empty, if the
--                                 project has none yet, so its default privileges can be set before step 9
--        storage.buckets          the census's `bucket:org_documents` row
--   5. Sets ALTER DEFAULT PRIVILEGES FOR ROLE postgres in public and supabase_migrations, so every table the 558
--      migrations create as `postgres` at step 9 (and the ledger table) is readable by this role at steps 15b and 16.6
--      with no second run of this script.
--   6. Ends with a check table: one row per check. Rows 1-9 must say `ok`; row 10 is a note (see below).
--
-- WHAT IT NEVER ALLOWS
--   - INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any table: never granted, and revoked again
--     here in case anything granted them. This is a privilege refusal: it holds even if the session turns read-only off.
--   - USAGE or SELECT on sequences (nextval would write).
--   - Writing any tenant's row: BYPASSRLS only lets it read past row-level security; the privilege refusals above
--     still stop every write.
--   - CREATE on any schema or the database; owning anything; SUPERUSER, CREATEDB, CREATEROLE, REPLICATION; inheriting
--     another role's privileges (NOINHERIT, and it is a member of no role).
--   - EXECUTE: nothing is granted. Every writing SECURITY DEFINER function in public is closed to PUBLIC by the
--     migrations, so the role cannot call one. What Postgres and Supabase give every role (PUBLIC) this script cannot
--     take away from one role: pg_net's queue tables and net.http_* functions, lo_create, temporary tables. In a
--     read-only session (the role's default) each of them is refused. A session that deliberately turns read-only off
--     can use them (check row 10; the evidence README, "What PUBLIC still reaches"). This is why the URL is a secret
--     and lives only in the owner's secret store.
--   - No password is in this file, and none is ever typed into the SQL Editor.

begin;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'alloy_readonly') then
    create role alloy_readonly login;  -- no password: it cannot sign in until the owner sets one
  end if;
end
$$;

-- The attributes, re-asserted on every run. No PASSWORD clause, so a re-run keeps the owner's password. NOSUPERUSER is
-- left out because only a superuser may name it; a new role is never a superuser, and check 1 below confirms it.
-- BYPASSRLS is the owner exception (2026-11-26) in the header: switched off on production before live customer data.
alter role alloy_readonly with login nocreatedb nocreaterole noinherit noreplication bypassrls connection limit 5;
alter role alloy_readonly set default_transaction_read_only = on;
alter role alloy_readonly set statement_timeout = '120s';
alter role alloy_readonly set lock_timeout = '5s';
alter role alloy_readonly set idle_in_transaction_session_timeout = '60s';
alter role alloy_readonly set row_security = off;  -- without BYPASSRLS a read of tenant rows errors; never 0 rows quietly

-- public: read every table and view, now and as the migrations create them.
grant usage on schema public to alloy_readonly;
grant select on all tables in schema public to alloy_readonly;
alter default privileges for role postgres in schema public grant select on tables to alloy_readonly;

-- supabase_migrations: the ledger. Same statement as the release tool's `emit-sql ledger-table` first line.
create schema if not exists supabase_migrations;
grant usage on schema supabase_migrations to alloy_readonly;
grant select on all tables in schema supabase_migrations to alloy_readonly;
alter default privileges for role postgres in schema supabase_migrations grant select on tables to alloy_readonly;

-- storage.buckets: the census reads only whether the org_documents bucket exists.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    grant usage on schema storage to alloy_readonly;
    grant select on storage.buckets to alloy_readonly;
  end if;
end
$$;

-- Never: take back anything beyond SELECT, in case an earlier grant gave it.
revoke insert, update, delete, truncate, references, trigger, maintain on all tables in schema public from alloy_readonly;
revoke insert, update, delete, truncate, references, trigger, maintain on all tables in schema supabase_migrations from alloy_readonly;
revoke all on all sequences in schema public from alloy_readonly;
revoke create on schema public from alloy_readonly;
revoke create on schema supabase_migrations from alloy_readonly;
alter default privileges for role postgres in schema public revoke insert, update, delete, truncate, references, trigger, maintain on tables from alloy_readonly;
alter default privileges for role postgres in schema public revoke all on sequences from alloy_readonly;
alter default privileges for role postgres in schema public revoke all on functions from alloy_readonly;

commit;

-- The check table. Rows 1-9 must say `ok`; row 10 is a note that lists what PUBLIC still reaches.
select c.check_name, c.result from (
  select 1 as n, 'role attributes' as check_name,
         case when r.rolcanlogin and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit
                   and not r.rolreplication and r.rolbypassrls and r.rolconnlimit = 5
              then 'ok' else 'WRONG: ' || row(r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit,
                                              r.rolreplication, r.rolbypassrls, r.rolconnlimit)::text end as result
    from pg_roles r where r.rolname = 'alloy_readonly'
  union all
  select 2, 'session settings',
         case when (select rolconfig from pg_roles where rolname = 'alloy_readonly')
                   @> array['default_transaction_read_only=on', 'statement_timeout=120s', 'lock_timeout=5s', 'idle_in_transaction_session_timeout=60s', 'row_security=off']
              then 'ok' else 'WRONG: ' || coalesce((select rolconfig from pg_roles where rolname = 'alloy_readonly')::text, 'none') end
  union all
  select 3, 'member of no role',
         case when not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member where r.rolname = 'alloy_readonly')
              then 'ok' else 'WRONG: is a member of another role' end
  union all
  select 4, 'public tables readable',
         coalesce((select 'WRONG: cannot read ' || string_agg(c.relname, ', ' order by c.relname)
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace
                    where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
                      and not has_table_privilege('alloy_readonly', c.oid, 'SELECT')), 'ok')
            || ' (' || (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace
                         where s.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f'))::text || ' tables and views)'
  union all
  select 5, 'no write privilege granted to the role',
         coalesce((select 'WRONG: ' || string_agg(s.nspname || '.' || c.relname || ' ' || a.privilege_type, ', ')
                     from pg_class c join pg_namespace s on s.oid = c.relnamespace, aclexplode(c.relacl) a
                    where a.grantee = 'alloy_readonly'::regrole and a.privilege_type <> 'SELECT'), 'ok')
  union all
  select 6, 'no CREATE on any schema or the database',
         coalesce((select 'WRONG: CREATE on schema ' || string_agg(nspname, ', ') from pg_namespace
                    where has_schema_privilege('alloy_readonly', oid, 'CREATE')), 'ok')
            || case when has_database_privilege('alloy_readonly', current_database(), 'CREATE') then ' WRONG: CREATE on the database' else '' end
  union all
  select 7, 'ledger',
         case when to_regclass('supabase_migrations.schema_migrations') is null then 'ok (no ledger table yet: step 9 creates it, and the default privileges cover it)'
              when has_table_privilege('alloy_readonly', 'supabase_migrations.schema_migrations', 'SELECT') then 'ok'
              else 'WRONG: cannot read supabase_migrations.schema_migrations' end
  union all
  select 8, 'storage.buckets',
         case when to_regclass('storage.buckets') is null then 'WRONG: no storage.buckets on this project'
              when has_table_privilege('alloy_readonly', 'storage.buckets', 'SELECT') then 'ok'
              else 'WRONG: cannot read storage.buckets' end
  union all
  select 9, 'default privileges for future tables',
         case when (select count(*) from pg_default_acl d join pg_namespace s on s.oid = d.defaclnamespace
                     where d.defaclrole = 'postgres'::regrole and d.defaclobjtype = 'r' and s.nspname in ('public', 'supabase_migrations')
                       and exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 'alloy_readonly'::regrole and a.privilege_type = 'SELECT')
                       and not exists (select 1 from aclexplode(d.defaclacl) a where a.grantee = 'alloy_readonly'::regrole and a.privilege_type <> 'SELECT')) = 2
              then 'ok' else 'WRONG: postgres''s default privileges in public and supabase_migrations do not grant SELECT (only) to alloy_readonly' end
  union all
  select 10, 'reachable through PUBLIC (note)',
         'note: Supabase grants these to every role and this script cannot take them away from one role; refused while '
         || 'the session is read-only: writes on '
         || coalesce((select string_agg(s.nspname || '.' || c.relname, ', ' order by s.nspname, c.relname)
                        from pg_class c join pg_namespace s on s.oid = c.relnamespace
                       where s.nspname not in ('pg_catalog', 'information_schema') and c.relkind in ('r', 'p')
                         and has_schema_privilege('alloy_readonly', s.oid, 'USAGE')
                         and (has_table_privilege('alloy_readonly', c.oid, 'INSERT') or has_table_privilege('alloy_readonly', c.oid, 'UPDATE')
                           or has_table_privilege('alloy_readonly', c.oid, 'DELETE'))), 'no table')
         || '; temporary tables: ' || case when has_database_privilege('alloy_readonly', current_database(), 'TEMP') then 'yes' else 'no' end
) c order by c.n;

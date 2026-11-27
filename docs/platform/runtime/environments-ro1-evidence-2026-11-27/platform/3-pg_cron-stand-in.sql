-- RO1 harness, step 3: a stand-in for pg_cron, which can only be created in the database named by cron.database_name
-- (`postgres` on the shared stack; a throwaway database cannot have it). Only what the chain uses: cron.job,
-- cron.schedule and cron.unschedule (20261002120000 and 20261003120000). The harness applies 20261002120000 with its
-- one `create extension if not exists pg_cron;` line replaced by a no-op, so the census reads extension:pg_cron|missing
-- in both cases. Nothing is scheduled: no worker reads this table. Run as supabase_admin.
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, schedule text not null, command text not null,
  nodename text not null default 'localhost', nodeport int not null default 5432, database text not null default current_database(),
  username text not null default current_user, active boolean not null default true, jobname text);
create or replace function cron.schedule(job_name text, schedule text, command text) returns bigint language sql security definer set search_path = cron as
  $$ insert into cron.job (schedule, command, jobname) values (schedule, command, job_name) returning jobid $$;
create or replace function cron.unschedule(job_name text) returns boolean language sql security definer set search_path = cron as
  $$ with d as (delete from cron.job where jobname = job_name returning 1) select count(*) > 0 from d $$;
grant usage on schema cron to postgres with grant option;
grant select on cron.job to postgres;
grant execute on function cron.schedule(text, text, text), cron.unschedule(text) to postgres;

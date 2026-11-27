-- RO1 harness, step 2 of a case database's platform: postgres's grants on what GoTrue and Storage just created, as the
-- shared stack's `postgres` database shows them. Run as supabase_admin, after `auth migrate` and Storage's migrate-call.
grant all on all tables in schema auth to postgres, dashboard_user;
grant select on all tables in schema auth to postgres with grant option;
grant all on all sequences in schema auth to postgres, dashboard_user;
grant execute on all functions in schema auth to public, postgres, dashboard_user;
grant all on all tables in schema storage to postgres with grant option;
grant all on all sequences in schema storage to postgres, dashboard_user;
grant all on all routines in schema storage to dashboard_user;

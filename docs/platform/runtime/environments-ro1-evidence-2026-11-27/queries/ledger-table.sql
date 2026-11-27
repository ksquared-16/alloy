create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key);
alter table supabase_migrations.schema_migrations add column if not exists statements text[];
alter table supabase_migrations.schema_migrations add column if not exists name text;

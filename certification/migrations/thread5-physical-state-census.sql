-- Read-only census: physical state AND ledger truth for the two Thread 5
-- migrations, in the shape `ledgerRepairEvidenceFromCensus` reads.
--
-- WHY IT LOOKS LIKE THIS. `database.repair_migration_ledger` will not register a
-- version on inference: it re-gathers its evidence at execution from a completed
-- governed census of the target, and reads three things out of it — the ledger
-- head, the ledger total, and one question per migration whose rows each end in
-- `true` when that check passed. The Thread 8C census established that contract;
-- this is the same contract answered for 20260910120000 and 20260910130000.
--
-- EVERY CHECK IS A PROPERTY THE MIGRATION DEFINES, not a proxy for it. "The
-- table exists" is the weakest possible evidence that a migration ran — a table
-- can exist with none of its constraints, none of its policies and none of its
-- grants. So each row below asserts something the migration file actually says:
-- the row-level security posture, the partial unique indexes that carry the
-- one-active-code rule, the policies by name, and the column grant that keeps
-- the digest columns unreadable.
--
-- Rows are `a ~ b ~ c ~ true|false`; the reader treats the last field as the
-- verdict and counts anything that is not `true` as a mismatch.
select question_id, kind, payload
from (
    -- ── 20260910120000_attendance_kiosk_producers ───────────────────────────
    select 'm120000'::text as question_id, 'check'::text as kind,
           ('attendance_kiosk_devices ~ table ~ present ~ '
            || (to_regclass('public.attendance_kiosk_devices') is not null)::text)::text as payload,
           '1a'::text as sort_key
    union all
    select 'm120000', 'check',
           'attendance_kiosk_devices ~ rls ~ enabled_and_forced ~ '
           || coalesce((select (c.relrowsecurity and c.relforcerowsecurity)::text
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relname = 'attendance_kiosk_devices'), 'false'),
           '1b'
    union all
    -- The producer identity and the credential digest are each unique, and the
    -- active-device index is partial. All three are correctness, not tuning.
    select 'm120000', 'check',
           'attendance_kiosk_devices ~ indexes ~ uq_producer_key,uq_credential_hash,idx_org_site_active ~ '
           || ((select count(*) from pg_indexes
                where schemaname = 'public' and tablename = 'attendance_kiosk_devices'
                  and indexname in ('uq_kiosk_producer_key','uq_kiosk_credential_hash','idx_kiosk_org_site_active')) = 3)::text,
           '1c'
    union all
    select 'm120000', 'check',
           'attendance_kiosk_devices ~ policies ~ select_org,write_org ~ '
           || ((select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'attendance_kiosk_devices'
                  and policyname in ('kiosk_devices_select_org','kiosk_devices_write_org')) = 2)::text,
           '1d'
    union all
    -- The column grant omits credential_hash on purpose. Proving the omission is
    -- proving the digest cannot leak through an ordinary select.
    select 'm120000', 'check',
           'attendance_kiosk_devices ~ grant ~ credential_hash_not_selectable ~ '
           || ((select count(*) from information_schema.column_privileges
                where table_schema = 'public' and table_name = 'attendance_kiosk_devices'
                  and grantee = 'authenticated' and column_name = 'credential_hash') = 0)::text,
           '1e'
    union all
    select 'm120000', 'check',
           'child_safeguarding_screenings ~ table ~ present ~ '
           || (to_regclass('public.child_safeguarding_screenings') is not null)::text,
           '1f'
    union all
    select 'm120000', 'check',
           'child_safeguarding_screenings ~ rls ~ enabled_and_forced ~ '
           || coalesce((select (c.relrowsecurity and c.relforcerowsecurity)::text
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relname = 'child_safeguarding_screenings'), 'false'),
           '1g'
    union all
    select 'm120000', 'check',
           'child_safeguarding_screenings ~ policies ~ select_org,write_org ~ '
           || ((select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'child_safeguarding_screenings'
                  and policyname in ('child_safeguarding_screening_select_org','child_safeguarding_screening_write_org')) = 2)::text,
           '1h'
    union all
    -- The source vocabulary is a CHECK constraint; without it the column would
    -- accept anything and "evaluated" would stop meaning what the resolver reads.
    select 'm120000', 'check',
           'child_safeguarding_screenings ~ constraints ~ source_vocabulary_and_reference ~ '
           || ((select count(*) from pg_constraint con
                join pg_class c on c.oid = con.conrelid
                join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'public' and c.relname = 'child_safeguarding_screenings'
                  and con.contype = 'c') >= 2)::text,
           '1i'

    union all

    -- ── 20260910130000_kiosk_person_codes ───────────────────────────────────
    select 'm130000', 'check',
           'person_kiosk_codes ~ table ~ present ~ '
           || (to_regclass('public.person_kiosk_codes') is not null)::text,
           '2a'
    union all
    select 'm130000', 'check',
           'person_kiosk_codes ~ rls ~ enabled_and_forced ~ '
           || coalesce((select (c.relrowsecurity and c.relforcerowsecurity)::text
                        from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relname = 'person_kiosk_codes'), 'false'),
           '2b'
    union all
    -- One ACTIVE code per person is a PARTIAL unique index. A plain unique index
    -- here would be a different rule, so the predicate is part of the check.
    select 'm130000', 'check',
           'person_kiosk_codes ~ index ~ uq_active_person_is_partial ~ '
           || coalesce((select (indexdef like '%WHERE (status = ''active''::text)%')::text
                        from pg_indexes
                        where schemaname = 'public' and tablename = 'person_kiosk_codes'
                          and indexname = 'uq_person_kiosk_code_active_person'), 'false'),
           '2c'
    union all
    select 'm130000', 'check',
           'person_kiosk_codes ~ index ~ uq_code_hash ~ '
           || ((select count(*) from pg_indexes
                where schemaname = 'public' and tablename = 'person_kiosk_codes'
                  and indexname = 'uq_person_kiosk_code_hash') = 1)::text,
           '2d'
    union all
    select 'm130000', 'check',
           'person_kiosk_codes ~ policies ~ select_org,write_org ~ '
           || ((select count(*) from pg_policies
                where schemaname = 'public' and tablename = 'person_kiosk_codes'
                  and policyname in ('person_kiosk_codes_select_org','person_kiosk_codes_write_org')) = 2)::text,
           '2e'
    union all
    select 'm130000', 'check',
           'person_kiosk_codes ~ grant ~ code_hash_not_selectable ~ '
           || ((select count(*) from information_schema.column_privileges
                where table_schema = 'public' and table_name = 'person_kiosk_codes'
                  and grantee = 'authenticated' and column_name = 'code_hash') = 0)::text,
           '2f'

    union all

    -- ── Ledger truth, in the same reading ───────────────────────────────────
    -- One census, so the physical state and the ledger state cannot disagree
    -- about WHEN they were observed.
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '3' || v.version
    from (values ('20260910120000'), ('20260910130000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '4'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '5'
) rows
order by sort_key;

-- Read-only census: physical state AND ledger truth for the four Attendance
-- Thread 6 migrations, in the shape `ledgerRepairEvidenceFromCensus` reads.
--
-- WHY THIS EXISTS. `database.apply_promoted_migration` applied these four to the
-- deployed primary and reported `ok: true`, `ledger: "applied"` for every one of
-- them, and the post-apply re-read found the ledger unchanged at 20260910183000
-- with all four still missing. That is G5, named in
-- `trusted-host-ledger-repair.mjs`: the apply runner executes psql and nothing
-- writes `supabase_migrations.schema_migrations`, so the SCHEMA moves and the
-- LEDGER does not. The Access & Identity lane hit exactly this on 20260910183000
-- one migration earlier, and `access-identity-physical-state-census.sql` is the
-- artifact it wrote. This is the same evidence for Thread 6.
--
-- WHAT IT MUST NOT BE. Proof that the migrations RAN, inferred from the fact that
-- somebody ran them. Every row below asserts a property THESE migrations define,
-- so a database that never received them cannot answer `true`:
--
--   * 100000 — the user↔person bridge table, BOTH partial unique indexes that
--     make "one active link" an invariant, the revoked-timestamp check, the
--     cross-org trigger, and RLS enabled AND forced;
--   * 110000 — the capture-scope column, its NOT NULL default, and the closed
--     two-value check that makes `assigned` the only narrowing;
--   * 120000 — all four integration tables, the typed-target check that stops a
--     mapping naming the wrong kind, the partial unique that makes one active
--     external id an invariant, the disposition vocabulary, and both tenancy
--     triggers;
--   * 130000 — both revocation columns on `action_links`, which are the whole of
--     that migration.
--
-- The last field of every row is the verdict. The reader counts anything that is
-- not `true` as a mismatch, and one mismatch refuses the repair.
select question_id, kind, payload
from (
    -- ── 20260911100000_user_person_identity_link ────────────────────────────

    select 'm100000'::text as question_id, 'check'::text as kind,
           ('user_person_links ~ table ~ '
            || (to_regclass('public.user_person_links') is not null)::text)::text as payload,
           '1a'::text as sort_key
    union all
    -- The two partial uniques ARE the invariant: one active link per user, one
    -- per person. A table without them is a different table.
    select 'm100000', 'check',
           'uq_user_person_link_active_user ~ index ~ '
           || exists (select 1 from pg_class i where i.relname = 'uq_user_person_link_active_user')::text,
           '1b'
    union all
    select 'm100000', 'check',
           'uq_user_person_link_active_person ~ index ~ '
           || exists (select 1 from pg_class i where i.relname = 'uq_user_person_link_active_person')::text,
           '1c'
    union all
    select 'm100000', 'check',
           'ck_user_person_link_revoked_has_timestamp ~ constraint ~ '
           || exists (select 1 from pg_constraint c
                       where c.conrelid = to_regclass('public.user_person_links')
                         and c.conname = 'ck_user_person_link_revoked_has_timestamp')::text,
           '1d'
    union all
    select 'm100000', 'check',
           'assert_user_person_link_same_org ~ trigger ~ '
           || exists (select 1 from pg_trigger t
                       where t.tgrelid = to_regclass('public.user_person_links')
                         and not t.tgisinternal
                         and t.tgname = 'trg_user_person_link_same_org')::text,
           '1e'
    union all
    -- Enabled AND forced: forcing is what stops the owning role bypassing it.
    select 'm100000', 'check',
           'user_person_links ~ rls_enabled_and_forced ~ '
           || coalesce((select (c.relrowsecurity and c.relforcerowsecurity)::text
                        from pg_class c where c.oid = to_regclass('public.user_person_links')), 'false'),
           '1f'

    -- ── 20260911110000_attendance_capture_scope_policy ──────────────────────

    union all
    select 'm110000', 'check',
           'user_access_profiles.attendance_capture_scope ~ column ~ '
           || exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.user_access_profiles')
                         and a.attname = 'attendance_capture_scope'
                         and a.attnum > 0 and not a.attisdropped)::text,
           '2a'
    union all
    select 'm110000', 'check',
           'attendance_capture_scope ~ not_null_default_site ~ '
           || coalesce((select (a.attnotnull
                                and pg_get_expr(d.adbin, d.adrelid) like '%site%')::text
                        from pg_attribute a
                        left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                        where a.attrelid = to_regclass('public.user_access_profiles')
                          and a.attname = 'attendance_capture_scope'
                          and a.attnum > 0 and not a.attisdropped), 'false'),
           '2b'
    union all
    -- The closed vocabulary. Without it the column is free text and `assigned`
    -- stops being the only narrowing the policy can express.
    select 'm110000', 'check',
           'attendance_capture_scope ~ closed_vocabulary ~ '
           || coalesce((select bool_or(pg_get_constraintdef(c.oid) like '%assigned%'
                                       and pg_get_constraintdef(c.oid) like '%site%')::text
                        from pg_constraint c
                        where c.conrelid = to_regclass('public.user_access_profiles')
                          and c.contype = 'c'
                          and pg_get_constraintdef(c.oid) like '%attendance_capture_scope%'), 'false'),
           '2c'

    -- ── 20260911120000_attendance_integration_producers ─────────────────────

    union all
    select 'm120000', 'check',
           'attendance_integration_producers ~ table ~ '
           || (to_regclass('public.attendance_integration_producers') is not null)::text,
           '3a'
    union all
    select 'm120000', 'check',
           'attendance_integration_producer_sites ~ table ~ '
           || (to_regclass('public.attendance_integration_producer_sites') is not null)::text,
           '3b'
    union all
    select 'm120000', 'check',
           'attendance_integration_mappings ~ table ~ '
           || (to_regclass('public.attendance_integration_mappings') is not null)::text,
           '3c'
    union all
    select 'm120000', 'check',
           'attendance_integration_events ~ table ~ '
           || (to_regclass('public.attendance_integration_events') is not null)::text,
           '3d'
    union all
    -- The typed-target check: a child mapping may not name a location, and the
    -- reverse. Its absence is how an identifier resolves to the wrong kind.
    select 'm120000', 'check',
           'ck_integration_mapping_target_matches_type ~ constraint ~ '
           || exists (select 1 from pg_constraint c
                       where c.conrelid = to_regclass('public.attendance_integration_mappings')
                         and c.conname = 'ck_integration_mapping_target_matches_type')::text,
           '3e'
    union all
    select 'm120000', 'check',
           'uq_integration_mapping_active_external ~ index ~ '
           || exists (select 1 from pg_class i where i.relname = 'uq_integration_mapping_active_external')::text,
           '3f'
    union all
    -- The disposition vocabulary this thread deliberately shares with
    -- `payment_provider_events` rather than inventing a second one.
    select 'm120000', 'check',
           'attendance_integration_events.disposition ~ vocabulary ~ '
           || coalesce((select bool_or(pg_get_constraintdef(c.oid) like '%applied%'
                                       and pg_get_constraintdef(c.oid) like '%unmapped%'
                                       and pg_get_constraintdef(c.oid) like '%unattributed%')::text
                        from pg_constraint c
                        where c.conrelid = to_regclass('public.attendance_integration_events')
                          and c.contype = 'c'
                          and pg_get_constraintdef(c.oid) like '%disposition%'), 'false'),
           '3g'
    union all
    select 'm120000', 'check',
           'attendance_integration_producer_sites ~ tenancy_trigger ~ '
           || exists (select 1 from pg_trigger t
                       where t.tgrelid = to_regclass('public.attendance_integration_producer_sites')
                         and not t.tgisinternal)::text,
           '3h'
    union all
    select 'm120000', 'check',
           'attendance_integration_mappings ~ tenancy_trigger ~ '
           || exists (select 1 from pg_trigger t
                       where t.tgrelid = to_regclass('public.attendance_integration_mappings')
                         and not t.tgisinternal)::text,
           '3i'

    -- ── 20260911130000_action_link_revocation ───────────────────────────────

    union all
    select 'm130000', 'check',
           'action_links.revoked_at ~ column ~ '
           || exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.action_links')
                         and a.attname = 'revoked_at'
                         and a.attnum > 0 and not a.attisdropped)::text,
           '4a'
    union all
    select 'm130000', 'check',
           'action_links.revoked_reason ~ column ~ '
           || exists (select 1 from pg_attribute a
                       where a.attrelid = to_regclass('public.action_links')
                         and a.attname = 'revoked_reason'
                         and a.attnum > 0 and not a.attisdropped)::text,
           '4b'

    -- ── Ledger truth, in the shape the repair reader expects ────────────────

    union all
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '5' || v.version
    from (values ('20260911100000'), ('20260911110000'), ('20260911120000'), ('20260911130000')) as v(version)
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '6'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '7'
) rows
order by sort_key;

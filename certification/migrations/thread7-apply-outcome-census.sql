-- Read-only census: WHAT ACTUALLY HAPPENED to the deployed primary when
-- `database.apply_promoted_migration` returned `migration_outcome_ambiguous`.
--
-- WHY THIS EXISTS. The governed apply of 20260911170000 failed terminally with
-- `migration_outcome_ambiguous`. The notification says nothing changed; the
-- failure code says the host could not TELL whether anything changed. Those are
-- different claims, and the notification itself says to check rather than infer.
-- An ambiguous DDL outcome on a production database is the one state that must
-- never be resolved by assumption, in either direction: re-running on the
-- assumption that nothing landed, or proceeding on the assumption that it all
-- did, are the same mistake with different blast radii.
--
-- Thread 6 already met this family of defect once — G5, where the schema moved
-- and the ledger did not. So PHYSICAL STATE and LEDGER STATE are asked
-- separately below and must be read separately. Agreement between them is a
-- finding, not an assumption.
--
-- WHAT PARTIAL APPLICATION WOULD LOOK LIKE. The migration performs five
-- distinct changes. If the runner executed them outside one transaction, the
-- database can be sitting in any prefix of this list:
--
--   1. the column                     ADD COLUMN IF NOT EXISTS financial_policy_id
--   2. its comment                    COMMENT ON COLUMN
--   3. the policy_kind vocabulary     DROP + ADD ..._policy_kind_check
--   4. the authority XOR              DROP + ADD ..._kind_chk
--
-- Each is therefore asked on its own, and the constraint questions read the
-- INSTALLED definition via pg_get_constraintdef rather than trusting a name to
-- imply a shape. A constraint that was dropped and not re-added is the most
-- dangerous prefix — the table would be left with LESS integrity than before
-- the migration ran — so absence is reported explicitly rather than as a
-- missing row.
--
-- WHAT THIS MUST NOT DO. Write anything, normalize anything, or repair
-- anything. It reads. The decision about what to do next is the Director's and
-- depends on these answers.
select question_id, kind, payload
from (
    -- ── 1. THE COLUMN ───────────────────────────────────────────────────────
    select 'column'::text as question_id, 'check'::text as kind,
           ('financial_reduction_applications ~ column ~ financial_policy_id_uuid_nullable ~ '
            || coalesce((select (a.atttypid = 'uuid'::regtype and not a.attnotnull)::text
                         from pg_attribute a
                         where a.attrelid = 'public.financial_reduction_applications'::regclass
                           and a.attname = 'financial_policy_id'
                           and a.attnum > 0 and not a.attisdropped), 'false'))::text as payload,
           '1a'::text as sort_key
    union all
    select 'column', 'value',
           'financial_policy_id ~ declared_type ~ '
           || coalesce((select format_type(a.atttypid, a.atttypmod)
                        from pg_attribute a
                        where a.attrelid = 'public.financial_reduction_applications'::regclass
                          and a.attname = 'financial_policy_id'
                          and a.attnum > 0 and not a.attisdropped), 'absent'),
           '1b'
    union all

    -- ── 2. THE FOREIGN KEY, AND ITS DELETE RULE ─────────────────────────────
    -- RESTRICT is the whole point: it is what refuses to delete a policy that
    -- already decided money. A column without this key is not the change.
    select 'fk', 'check',
           'financial_policy_id ~ fk ~ financial_policies_id_on_delete_restrict ~ '
           || coalesce((select (c.confrelid = 'public.financial_policies'::regclass
                                and c.confdeltype = 'r')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.contype = 'f'
                          and c.conkey = array[(select a.attnum from pg_attribute a
                                                where a.attrelid = c.conrelid
                                                  and a.attname = 'financial_policy_id')]), 'false'),
           '2a'
    union all
    select 'fk', 'value',
           'financial_policy_id ~ fk_delete_action ~ '
           || coalesce((select case c.confdeltype
                                 when 'r' then 'restrict' when 'c' then 'cascade'
                                 when 'n' then 'set_null' when 'a' then 'no_action'
                                 when 'd' then 'set_default' else c.confdeltype::text end
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.contype = 'f'
                          and c.conkey = array[(select a.attnum from pg_attribute a
                                                where a.attrelid = c.conrelid
                                                  and a.attname = 'financial_policy_id')]), 'no_such_key'),
           '2b'
    union all

    -- ── 3. THE COMMENT ──────────────────────────────────────────────────────
    select 'comment', 'check',
           'financial_policy_id ~ comment ~ present ~ '
           || coalesce((select (col_description(a.attrelid, a.attnum) is not null)::text
                        from pg_attribute a
                        where a.attrelid = 'public.financial_reduction_applications'::regclass
                          and a.attname = 'financial_policy_id'
                          and a.attnum > 0 and not a.attisdropped), 'false'),
           '3a'
    union all

    -- ── 4. THE policy_kind VOCABULARY ───────────────────────────────────────
    -- Read from the installed definition. A named constraint is not a shape.
    select 'policy_kind', 'check',
           'financial_reduction_applications_policy_kind_check ~ vocabulary ~ admits_vacation_credit ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%vacation_credit%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_policy_kind_check'), 'false'),
           '4a'
    union all
    select 'policy_kind', 'check',
           'financial_reduction_applications_policy_kind_check ~ vocabulary ~ keeps_the_three_it_had ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%waiver%'
                                and pg_get_constraintdef(c.oid) like '%sibling_discount%'
                                and pg_get_constraintdef(c.oid) like '%discount%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_policy_kind_check'), 'false'),
           '4b'
    union all
    -- A DROP that was not followed by its ADD leaves the table with LESS
    -- integrity than before. Say so out loud.
    select 'policy_kind', 'check',
           'financial_reduction_applications_policy_kind_check ~ exists_at_all ~ not_dropped_without_replacement ~ '
           || exists (select 1 from pg_constraint c
                      where c.conrelid = 'public.financial_reduction_applications'::regclass
                        and c.conname = 'financial_reduction_applications_policy_kind_check')::text,
           '4c'
    union all

    -- ── 5. THE AUTHORITY XOR ────────────────────────────────────────────────
    select 'kind_chk', 'check',
           'financial_reduction_applications_kind_chk ~ exists_at_all ~ not_dropped_without_replacement ~ '
           || exists (select 1 from pg_constraint c
                      where c.conrelid = 'public.financial_reduction_applications'::regclass
                        and c.conname = 'financial_reduction_applications_kind_chk')::text,
           '5a'
    union all
    select 'kind_chk', 'check',
           'financial_reduction_applications_kind_chk ~ policy_branch ~ exclusive_or_over_both_authorities ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%financial_policy_id IS NOT NULL%'
                                and pg_get_constraintdef(c.oid) like '%commercial_policy_id IS NOT NULL%'
                                and pg_get_constraintdef(c.oid) like '%<>%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'false'),
           '5b'
    union all
    select 'kind_chk', 'check',
           'financial_reduction_applications_kind_chk ~ manual_branch ~ carries_no_policy_authority ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%commercial_policy_id IS NULL%'
                                and pg_get_constraintdef(c.oid) like '%financial_policy_id IS NULL%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'false'),
           '5c'
    union all
    -- The definition itself, so a disagreement above can be read rather than guessed.
    select 'kind_chk', 'value',
           'financial_reduction_applications_kind_chk ~ installed_definition ~ '
           || coalesce((select pg_get_constraintdef(c.oid)
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'absent'),
           '5d'
    union all

    -- ── 6. LEDGER TRUTH, ASKED SEPARATELY ───────────────────────────────────
    -- G5 is the case where every answer above is `true` and this one is `absent`.
    select 'ledger_version', 'row',
           '20260911170000 ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m
                                 where m.version = '20260911170000')
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m
                      where m.version = '20260911170000')::text,
           '6a'
    union all
    select 'ledger_version_count', 'value',
           '20260911170000 ~ occurrences ~ '
           || (select count(*)::text from supabase_migrations.schema_migrations m
               where m.version = '20260911170000'),
           '6b'
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '6c'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '6d'
    union all

    -- ── 7. THE DATA IS STILL UNTOUCHED ──────────────────────────────────────
    -- The pre-migration census read zero rows. If that is no longer true, some
    -- other writer moved, and the invariant reasoning has to be redone.
    select 'rows', 'value',
           'financial_reduction_applications ~ total_rows ~ '
           || (select count(*)::text from public.financial_reduction_applications),
           '7a'
) rows
order by sort_key;

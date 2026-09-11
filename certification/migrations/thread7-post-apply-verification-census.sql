-- Read-only census: did 20260911170000 actually land, and does the ledger agree?
--
-- WHY A NEW ARTIFACT RATHER THAN THE ONE ALREADY COMMITTED. Re-filing the
-- earlier census verbatim did not re-read the database. The governed request
-- deduplicated onto the trusted-host action from ONE MINUTE BEFORE the apply and
-- returned its result, reported as `complete — Succeeded`. A pre-apply reading
-- presented as a post-apply answer is worse than no answer, because it reads as
-- one. This asks a different question, so it is a different request — and the
-- question it asks is the one that now matters.
--
-- WHAT THE RUNTIME SAID. `post_apply_verification_failed`: applied 20260911170000
-- but the hosted ledger does not report it. `hosted_head_before` and
-- `hosted_head_after` were identical, the per-migration result was `ok: true`
-- with `ledger: "applied"`, and the runtime set `recensus_required`. That is G5 —
-- the schema moves and the ledger does not — and it is the one shape that must
-- never be resolved by assuming either half.
--
-- So the two halves are asked separately and answered separately. Every physical
-- question reads the INSTALLED definition rather than trusting a constraint name
-- to imply a shape, because "a constraint called kind_chk exists" was true before
-- this migration too.
--
-- This is also the post-apply certification list, so a clean reading here is
-- both the G5 evidence and the proof the migration did what it said.
--
-- WHY THE PHYSICAL CHECKS ARE NAMED `m170000`. `ledgerRepairEvidenceFromCensus`
-- looks for a question whose id is `m` plus the last six characters of the
-- version, and counts a version PHYSICALLY_PRESENT only when that question has
-- rows and EVERY row ends in `true`. A census that measures the right things
-- under the wrong question id is read as having measured nothing — which is the
-- right refusal reached by the wrong reasoning, and the first version of this
-- file earned exactly that (`physical_state_census_does_not_cover`). So the
-- boolean checks live under `m170000` and nothing else does: the descriptive
-- rows below are for a human reading the result and would fail a `~ true` test
-- by design.
select question_id, kind, payload
from (
    -- ── PHYSICAL: the column, exactly as declared ───────────────────────────
    select 'm170000'::text as question_id, 'check'::text as kind,
           ('financial_reduction_applications ~ column ~ financial_policy_id_uuid_nullable ~ '
            || coalesce((select (a.atttypid = 'uuid'::regtype and not a.attnotnull)::text
                         from pg_attribute a
                         where a.attrelid = 'public.financial_reduction_applications'::regclass
                           and a.attname = 'financial_policy_id'
                           and a.attnum > 0 and not a.attisdropped), 'false'))::text as payload,
           '1a'::text as sort_key
    union all
    select 'column_detail', 'value',
           'financial_policy_id ~ declared_type ~ '
           || coalesce((select format_type(a.atttypid, a.atttypmod)
                        from pg_attribute a
                        where a.attrelid = 'public.financial_reduction_applications'::regclass
                          and a.attname = 'financial_policy_id'
                          and a.attnum > 0 and not a.attisdropped), 'absent'),
           '1b'
    union all

    -- ── PHYSICAL: the key, and its delete rule ──────────────────────────────
    -- RESTRICT is the whole point: it is what refuses to delete a policy that
    -- already decided money. A column without this key is not the change.
    select 'm170000', 'check',
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
    select 'fk_detail', 'value',
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
    select 'm170000', 'check',
           'financial_policy_id ~ comment ~ present ~ '
           || coalesce((select (col_description(a.attrelid, a.attnum) is not null)::text
                        from pg_attribute a
                        where a.attrelid = 'public.financial_reduction_applications'::regclass
                          and a.attname = 'financial_policy_id'
                          and a.attnum > 0 and not a.attisdropped), 'false'),
           '2c'
    union all

    -- ── PHYSICAL: the vocabulary ────────────────────────────────────────────
    select 'm170000', 'check',
           'financial_reduction_applications_policy_kind_check ~ vocabulary ~ admits_vacation_credit ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%vacation_credit%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_policy_kind_check'), 'false'),
           '3a'
    union all
    select 'm170000', 'check',
           'financial_reduction_applications_policy_kind_check ~ vocabulary ~ keeps_the_three_it_had ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%waiver%'
                                and pg_get_constraintdef(c.oid) like '%sibling_discount%'
                                and pg_get_constraintdef(c.oid) like '%discount%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_policy_kind_check'), 'false'),
           '3b'
    union all

    -- ── PHYSICAL: exactly one policy authority ──────────────────────────────
    -- Both branches, because the migration rewrote both. A policy reduction must
    -- name one authority and not two; a manual one must name none.
    select 'm170000', 'check',
           'financial_reduction_applications_kind_chk ~ policy_branch ~ exclusive_or_over_both_authorities ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%financial_policy_id IS NOT NULL%'
                                and pg_get_constraintdef(c.oid) like '%commercial_policy_id IS NOT NULL%'
                                and pg_get_constraintdef(c.oid) like '%<>%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'false'),
           '4a'
    union all
    select 'm170000', 'check',
           'financial_reduction_applications_kind_chk ~ manual_branch ~ carries_no_policy_authority ~ '
           || coalesce((select (pg_get_constraintdef(c.oid) like '%commercial_policy_id IS NULL%'
                                and pg_get_constraintdef(c.oid) like '%financial_policy_id IS NULL%')::text
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'false'),
           '4b'
    union all
    -- The definition itself, so a disagreement above is read rather than guessed.
    select 'kind_chk_definition', 'value',
           'financial_reduction_applications_kind_chk ~ installed_definition ~ '
           || coalesce((select pg_get_constraintdef(c.oid)
                        from pg_constraint c
                        where c.conrelid = 'public.financial_reduction_applications'::regclass
                          and c.conname = 'financial_reduction_applications_kind_chk'), 'absent'),
           '4c'
    union all

    -- ── LEDGER: asked separately, because this is where they disagreed ──────
    -- Exactly once. A version registered twice is its own defect, and "present"
    -- alone cannot tell the difference.
    select 'ledger_version', 'row',
           '20260911170000 ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m
                                 where m.version = '20260911170000')
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m
                      where m.version = '20260911170000')::text,
           '5a'
    union all
    select 'ledger_version_count', 'value',
           '20260911170000 ~ occurrences ~ '
           || (select count(*)::text from supabase_migrations.schema_migrations m
               where m.version = '20260911170000'),
           '5b'
    union all
    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '5c'
    union all
    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '5d'
    union all

    -- ── The data the invariant reasoning rests on ───────────────────────────
    select 'rows', 'value',
           'financial_reduction_applications ~ total_rows ~ '
           || (select count(*)::text from public.financial_reduction_applications),
           '6a'
) rows
order by sort_key;

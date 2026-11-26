-- Read-only census: physical state AND ledger truth for 20261119120000, in the
-- exact shape `ledgerRepairEvidenceFromCensus` reads.
--
-- WHY THIS EXISTS. The W7 slice-1 merge was refused `hosted_migration_behind`:
-- "the deployed primary is missing 1 migration(s) already promoted on staging:
-- 20261119120000". The apply was then refused `production_precondition_refused`
-- — "Hosted parity already reports PASS; there is no gap for this mutation to
-- close." Two gates, two answers, and both cannot be right.
--
-- The object-level evidence says the SCHEMA moved and the LEDGER did not, which
-- is G5 and is the condition a ledger repair exists for. 20261119120000 does
-- exactly one thing: it moves the commercial-close schedule from 04:00 UTC —
-- where 20261118120000 created it, `+ interval '4 hours'` — to 12:00 UTC, so the
-- wake lands after local midnight in the deployed estate's zone. The decisions
-- census taken earlier in this same run (gar_58a6eea3af6f8e, q5) read
-- `financials.billing_period_close.evaluate` on the deployed primary with
-- `next_due_at_utc = 2026-10-06T12:00`. A database that never received this
-- migration would still be at 04:00.
--
-- This re-asserts that property in the machine-readable contract the repair
-- reader requires, rather than asking anyone to take the earlier reading's word
-- for it, and it reads the ledger in the SAME census so "the schema has it" and
-- "the ledger does not" cannot be two different moments.
--
-- `question_id` is `m120000` because the reader keys on the last six digits of
-- the version. Every row's last field is the verdict, and the reader treats
-- anything that is not the literal `true` as a mismatch.
--
-- WHAT IT MUST NOT BE. Proof that somebody ran the migration. Each row below
-- asserts a property THIS migration defines, so a database still at 20261118120000
-- cannot answer `true` to the first two.
--
-- The existence row matters and is not ceremony: "no schedule sits at an hour
-- other than 12" is vacuously true on a database with no close schedule at all,
-- and a vacuous truth is the kind of evidence that looks like proof and is not.

select question_id, kind, payload
from (
    -- 1. THE SCHEDULE EXISTS AT ALL, so nothing below is vacuous.
    select 'm120000'::text as question_id, 'check'::text as kind,
           'close_schedule ~ registered ~ at_least_one ~ '
           || (count(*) > 0)::text as payload,
           '1'::text as sort_key
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'

    union all

    -- 2. EVERY close schedule wakes at 12:00 UTC. This is the migration's whole
    --    effect; at 04:00 it has not been applied.
    select 'm120000', 'check',
           'close_schedule ~ next_due_at ~ all_at_1200_utc ~ '
           || (count(*) FILTER (
                  WHERE extract(hour from next_due_at at time zone 'UTC') = 12
                    AND extract(minute from next_due_at at time zone 'UTC') = 0
              ) = count(*))::text,
           '2'
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'

    union all

    -- 3. AND NONE AT ANY OTHER HOUR, stated from the other side so a partial
    --    application cannot answer true to both.
    select 'm120000', 'check',
           'close_schedule ~ off_hour_rows ~ none ~ '
           || (count(*) = 0)::text,
           '3'
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'
       and extract(hour from next_due_at at time zone 'UTC') <> 12

    union all

    -- 4. WHAT THE MIGRATION PRESERVED. It changes the time of day and nothing
    --    else: the same row, the same handler, daily, active, tenant-scoped. A
    --    re-implementation that rebuilt the row would fail this.
    select 'm120000', 'check',
           'close_schedule ~ shape ~ daily_active_tenant ~ '
           || (count(*) FILTER (
                  WHERE recurrence_kind = 'daily' AND is_active AND org_id IS NOT NULL
              ) = count(*))::text,
           '4'
      from public.scheduled_work
     where handler_key = 'financials.billing_period_close.evaluate'

    union all

    -- ── Ledger truth, in the same reading ───────────────────────────────────
    select 'ledger_version', 'row',
           v.version || ' ~ registered ~ '
           || (case when exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)
                    then 'present' else 'absent' end)
           || ' ~ '
           || exists (select 1 from supabase_migrations.schema_migrations m where m.version = v.version)::text,
           '5' || v.version
      from (values ('20261119120000')) as v(version)

    union all

    select 'ledger_head', 'value',
           (select coalesce(max(version), 'none') from supabase_migrations.schema_migrations), '6'

    union all

    select 'ledger_total', 'value',
           (select count(*)::text from supabase_migrations.schema_migrations), '7'
) rows
order by sort_key;

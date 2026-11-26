-- Read-only census: is the future-period activation schedule REGISTERED on the deployed primary?
--
-- WHY THIS RATHER THAN RE-FILING THE APPLY. `database.apply_promoted_migration` for 20261120120000
-- was refused `production_precondition_refused` — "hosted parity already reports PASS; there is no
-- gap for this mutation to close" — which is the same refusal 20261119120000 drew earlier in this
-- run, and in that case the version turned out to be present already. The promotion pipeline appears
-- to apply promoted migrations on merge. Parity PASS can mean "already applied", so the thing to do
-- is census the object rather than argue with the gate.
--
-- It is also the activation proof the Director asked for, at the only layer that can give it: the
-- unit tests prove the handler and the registration boundary; only the deployed primary can say
-- whether the clock actually holds a row that resolves to it.
--
-- q1  the activation schedule itself, one row per registration, with the wake time the migration pins.
SELECT 'q1' AS question_id, 'rows' AS kind,
       json_build_object(
           'handler_key', sw.handler_key,
           'recurrence_kind', sw.recurrence_kind,
           'is_active', sw.is_active,
           'org_scoped', (sw.org_id IS NOT NULL),
           'next_due_at_utc', to_char(sw.next_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
           'label', sw.label,
           'purpose', sw.domain_ref ->> 'purpose',
           'authority', sw.domain_ref ->> 'authority',
           'gate', sw.domain_ref ->> 'gate'
       )::text AS payload
  FROM public.scheduled_work sw
 WHERE sw.handler_key = 'financials.future_period_charge.activate'

UNION ALL

-- q2  the coherence the migration's own self-test asserts, re-asserted from outside it.
SELECT 'q2', 'row',
       json_build_object(
           'activation_schedules', (
               SELECT count(*) FROM public.scheduled_work
                WHERE handler_key = 'financials.future_period_charge.activate'),
           'orgs_holding_canonical_periods', (
               SELECT count(DISTINCT org_id) FROM public.financial_billing_periods),
           'misconfigured', (
               SELECT count(*) FROM public.scheduled_work
                WHERE handler_key = 'financials.future_period_charge.activate'
                  AND (recurrence_kind <> 'daily' OR is_active IS NOT TRUE OR org_id IS NULL)),
           'off_time', (
               SELECT count(*) FROM public.scheduled_work
                WHERE handler_key = 'financials.future_period_charge.activate'
                  AND (extract(hour from next_due_at at time zone 'UTC') <> 11
                    OR extract(minute from next_due_at at time zone 'UTC') <> 30)),
           'duplicated_orgs', (
               SELECT count(*) FROM (
                   SELECT org_id FROM public.scheduled_work
                    WHERE handler_key = 'financials.future_period_charge.activate'
                    GROUP BY org_id HAVING count(*) > 1) d),
           'activation_precedes_close_wake', (
               SELECT coalesce(
                   max(CASE WHEN a.handler_key = 'financials.future_period_charge.activate' THEN 1 ELSE 0 END) = 1
                   AND min(CASE WHEN a.handler_key = 'financials.future_period_charge.activate'
                                THEN extract(hour from a.next_due_at at time zone 'UTC') * 60
                                   + extract(minute from a.next_due_at at time zone 'UTC') END)
                     < min(CASE WHEN a.handler_key = 'financials.billing_period_close.evaluate'
                                THEN extract(hour from a.next_due_at at time zone 'UTC') * 60
                                   + extract(minute from a.next_due_at at time zone 'UTC') END),
                   false)
                 FROM public.scheduled_work a
                WHERE a.handler_key IN ('financials.future_period_charge.activate',
                                        'financials.billing_period_close.evaluate'))
       )::text AS payload

UNION ALL

-- q3  the migration ledger's own answer, so "the object exists" and "the ledger says so" are one reading.
SELECT 'q3', 'row',
       json_build_object(
           'ledger_has_20261120120000', exists (
               SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261120120000'),
           'ledger_head', (SELECT coalesce(max(version)::text, 'none') FROM supabase_migrations.schema_migrations),
           'ledger_total', (SELECT count(*) FROM supabase_migrations.schema_migrations)
       )::text AS payload

UNION ALL

-- q4  and whether the gate has produced anything for it to act on yet. Zero is the expected answer
--     until the Director creates a future-dated charge; it is reported so nothing is inferred.
SELECT 'q4', 'row',
       json_build_object(
           'drafts_waiting_for_a_period', count(*) FILTER (
               WHERE c.metadata ->> 'post_gate' = 'period_not_started'),
           'draft_charges', count(*),
           'posted_in_future_period', (
               SELECT count(*) FROM public.charges c2
                JOIN public.financial_billing_periods bp2 ON bp2.id = c2.billing_period_id
                WHERE c2.status = 'posted' AND bp2.starts_on > current_date)
       )::text AS payload
  FROM public.charges c
 WHERE c.status = 'draft'

-- W7 SLICE 1 DIRECTOR DECISIONS — the four questions the decisions make load-bearing.
--
-- F001 confirmed a lifecycle in which a FUTURE-period charge is a draft until its period begins.
-- Two things follow that code reading cannot settle:
--   * the estate already contains charges POSTED into a period that has not started (4 were counted
--     in the slice-1 census). Deciding whether they need no action, a governed repair, or only
--     forward-correct semantics requires knowing WHAT they are — when they were created, when they
--     post-dated to, and whether they are Kelly's W7 fixtures or ordinary generated billing.
--   * the activation path is a scheduled handler, and a schedule must not be registered twice. What
--     financials schedules already exist on this estate is a fact, not an assumption.
--
-- F002 confirmed that a user permitted to create financial activity must resolve to a named human.
-- The slice-1 census proved zero active links exist tenant-wide. What it did NOT establish is
-- whether the cleanup is even possible: is there a NAMED PERSON to link each financial actor to, and
-- how many users hold a role that lets them move money at all? Those two numbers decide whether the
-- requirement is enforceable today or is cross-lane Access work.
--
-- READ-ONLY. No name, no email, no person id and no user id is selected anywhere below — only
-- counts, dates, shapes and non-personal configuration values. q1 returns charge-level rows because
-- the Director's disposition question is about specific economics, and a charge's period key, its
-- dates and its amount are commercial facts rather than personal ones.

-- q1  WHAT the already-posted future-period charges actually are, one row each.
SELECT 'q1' AS question_id, 'rows' AS kind,
       json_build_object(
           'period_key', bp.period_key,
           'period_starts_on', bp.starts_on,
           'period_status', bp.status,
           'charge_status', c.status,
           'posted_on', (c.posted_at AT TIME ZONE 'UTC')::date,
           'created_on', (c.created_at AT TIME ZONE 'UTC')::date,
           'amount_cents', c.amount_cents,
           'charge_category', c.charge_category,
           'origin', coalesce(c.metadata ->> 'source', 'unrecorded'),
           'billing_period_generation', c.billing_period_generation,
           'has_template', (c.charge_template_id IS NOT NULL)
       )::text AS payload
  FROM public.charges c
  JOIN public.financial_billing_periods bp ON bp.id = c.billing_period_id
 WHERE c.status = 'posted'
   AND bp.starts_on > current_date

UNION ALL

-- q2  the draft population, and whether any draft is ALREADY waiting on a future period.
SELECT 'q2', 'row',
       json_build_object(
           'draft_charges', count(*),
           'draft_bound_to_a_period', count(*) FILTER (WHERE c.billing_period_id IS NOT NULL),
           'draft_in_future_period', count(*) FILTER (WHERE bp.starts_on > current_date),
           'post_gate_review_required', count(*) FILTER (WHERE c.metadata ->> 'post_gate' = 'review_required'),
           'post_gate_post_failed', count(*) FILTER (WHERE c.metadata ->> 'post_gate' = 'post_failed'),
           'post_gate_period_not_started', count(*) FILTER (WHERE c.metadata ->> 'post_gate' = 'period_not_started'),
           'never_attempted', count(*) FILTER (WHERE c.metadata -> 'post_attempt' IS NULL
                                                 AND (c.metadata ->> 'post_gate') IS NULL)
       )::text AS payload
  FROM public.charges c
  LEFT JOIN public.financial_billing_periods bp ON bp.id = c.billing_period_id
 WHERE c.status = 'draft'

UNION ALL

-- q3  EVERY financial actor, not only charge creators: can each one resolve to a named human?
SELECT 'q3', 'row',
       json_build_object(
           'distinct_financial_actors', count(*),
           'with_active_person_link', count(*) FILTER (WHERE a.person_id IS NOT NULL),
           'resolves_to_named_person', count(*) FILTER (WHERE a.named),
           'acted_on_charges', count(*) FILTER (WHERE actors.from_charges),
           'acted_on_reductions', count(*) FILTER (WHERE actors.from_reductions)
       )::text AS payload
  FROM (
      SELECT user_id,
             bool_or(src = 'charge')    AS from_charges,
             bool_or(src = 'reduction') AS from_reductions
        FROM (
            SELECT created_by AS user_id, 'charge' AS src
              FROM public.charges WHERE created_by IS NOT NULL
            UNION ALL
            SELECT created_by, 'reduction'
              FROM public.financial_reduction_applications WHERE created_by IS NOT NULL
        ) all_actors
       GROUP BY user_id
  ) actors
  LEFT JOIN LATERAL (
      SELECT upl.person_id,
             coalesce(nullif(trim(p.full_name), ''),
                      nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')) IS NOT NULL AS named
        FROM public.user_person_links upl
        LEFT JOIN public.persons p ON p.id = upl.person_id
       WHERE upl.user_id = actors.user_id
         AND upl.status = 'active'
       LIMIT 1
  ) a ON true

UNION ALL

-- q4  IS THE CLEANUP POSSIBLE? Users holding a role that can move money, and whether a named person
--     exists in the same org to link them to. Counts only — no identity is named or matched here.
SELECT 'q4', 'row',
       json_build_object(
           'users_with_money_capable_role', (
               SELECT count(DISTINCT ur.user_id)
                 FROM public.user_roles ur
                WHERE ur.role IN ('owner', 'admin', 'ops')
           ),
           'money_capable_roles_present', (
               SELECT json_agg(DISTINCT ur.role)
                 FROM public.user_roles ur
                WHERE ur.role IN ('owner', 'admin', 'ops')
           ),
           'orgs_with_money_capable_users', (
               SELECT count(DISTINCT ur.org_id)
                 FROM public.user_roles ur
                WHERE ur.role IN ('owner', 'admin', 'ops')
           ),
           'named_persons_available_to_link', (
               SELECT count(*)
                 FROM public.persons p
                WHERE p.archived_at IS NULL
                  AND coalesce(nullif(trim(p.full_name), ''),
                               nullif(trim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, '')), '')) IS NOT NULL
                  AND p.org_id IN (SELECT DISTINCT org_id FROM public.user_roles WHERE role IN ('owner','admin','ops'))
           ),
           'person_links_any_status', (SELECT count(*) FROM public.user_person_links)
       )::text AS payload

UNION ALL

-- q5  WHICH financials schedules already exist. The activation path must not duplicate one.
SELECT 'q5', 'rows',
       json_build_object(
           'handler_key', sw.handler_key,
           'recurrence_kind', sw.recurrence_kind,
           'is_active', sw.is_active,
           'org_scoped', (sw.org_id IS NOT NULL),
           'next_due_at_utc', to_char(sw.next_due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI'),
           'label', sw.label
       )::text AS payload
  FROM public.scheduled_work sw
 WHERE sw.handler_key LIKE 'financials.%'

UNION ALL

-- q6  the business timezone the activation gate will read, and how many orgs declare one.
SELECT 'q6', 'row',
       json_build_object(
           'org_settings_rows', count(*),
           'declared_timezones', json_agg(DISTINCT coalesce(
               nullif(trim(metadata ->> 'operational_timezone'), ''),
               nullif(trim(metadata ->> 'timezone'), ''),
               nullif(trim(metadata ->> 'time_zone'), ''),
               'undeclared'
           )),
           'orgs_holding_canonical_periods', (SELECT count(DISTINCT org_id) FROM public.financial_billing_periods)
       )::text AS payload
  FROM public.org_settings

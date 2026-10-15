-- §7 — THE DEPLOYED TIMEZONE ESTATE, before deciding whether one UTC schedule time is safe.
--
-- The certified finding: the commercial-close schedule wakes at 04:00 UTC. For an organisation west
-- of UTC−4 that instant is still the PREVIOUS local day, so the wake correctly declines and the
-- close lands at the following wake — about 24 hours later than necessary. Safe (never early, only
-- late), but needless.
--
-- A period ending on local date D becomes eligible when the org's business date is D+1, which
-- begins at local midnight. A wake at UTC time T sees business date D+1 only if T is at or after
-- that local midnight, i.e. T >= (−utc_offset). So the binding constraint is the WESTERNMOST
-- organisation: the further west, the later in UTC its local midnight falls.
--
-- This census measures the actual estate rather than assuming one. It reads the same
-- `org_settings.metadata` that `fetchOperationalTimezoneForOrg` reads, and the same key precedence.
--
-- READ-ONLY. No org is named — only zones and counts, so nothing here identifies a tenant.
--
-- q1  every distinct operational timezone among orgs that hold canonical billing periods, with the
--     UTC time of that zone's local midnight TODAY (which is what a schedule time must clear).
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object(
           'iana', z.iana,
           'orgs', count(*),
           'utc_offset_hours_now', round(extract(epoch from (now() at time zone z.iana) - (now() at time zone 'UTC')) / 3600.0, 2),
           'local_midnight_utc_hour_now', round(
               (24 - extract(epoch from (now() at time zone z.iana) - (now() at time zone 'UTC')) / 3600.0)::numeric % 24, 2)
       )::text AS payload
  FROM (
    SELECT bp.org_id,
           coalesce(
               nullif(trim(os.metadata ->> 'timezone'), ''),
               nullif(trim(os.metadata ->> 'time_zone'), ''),
               'UTC'
           ) AS iana
      FROM (SELECT DISTINCT org_id FROM public.financial_billing_periods) bp
      LEFT JOIN public.org_settings os ON os.org_id = bp.org_id
  ) z
 GROUP BY z.iana

UNION ALL

-- q2  the westernmost org in the estate — the one that decides whether a single UTC time is safe.
SELECT 'q2', 'row',
       json_build_object(
           'orgs_with_canonical_periods', (SELECT count(DISTINCT org_id) FROM public.financial_billing_periods),
           'distinct_zones', (
               SELECT count(DISTINCT coalesce(nullif(trim(os.metadata ->> 'timezone'), ''),
                                              nullif(trim(os.metadata ->> 'time_zone'), ''), 'UTC'))
                 FROM (SELECT DISTINCT org_id FROM public.financial_billing_periods) bp
                 LEFT JOIN public.org_settings os ON os.org_id = bp.org_id
           ),
           'min_utc_offset_hours', (
               SELECT round(min(extract(epoch from (now() at time zone iana) - (now() at time zone 'UTC')) / 3600.0)::numeric, 2)
                 FROM (SELECT DISTINCT coalesce(nullif(trim(os.metadata ->> 'timezone'), ''),
                                                nullif(trim(os.metadata ->> 'time_zone'), ''), 'UTC') AS iana
                         FROM (SELECT DISTINCT org_id FROM public.financial_billing_periods) bp
                         LEFT JOIN public.org_settings os ON os.org_id = bp.org_id) q
           ),
           'max_utc_offset_hours', (
               SELECT round(max(extract(epoch from (now() at time zone iana) - (now() at time zone 'UTC')) / 3600.0)::numeric, 2)
                 FROM (SELECT DISTINCT coalesce(nullif(trim(os.metadata ->> 'timezone'), ''),
                                                nullif(trim(os.metadata ->> 'time_zone'), ''), 'UTC') AS iana
                         FROM (SELECT DISTINCT org_id FROM public.financial_billing_periods) bp
                         LEFT JOIN public.org_settings os ON os.org_id = bp.org_id) q
           )
       )::text AS payload

UNION ALL

-- q3  the schedule as it actually stands on deployed: one active daily row per org, and the
--     time-of-day its next_due_at currently anchors. This is what a timing change would move.
SELECT 'q3', 'row',
       json_build_object(
           'close_schedules', count(*),
           'active', count(*) FILTER (WHERE sw.is_active),
           'daily', count(*) FILTER (WHERE sw.recurrence_kind = 'daily'),
           'distinct_utc_hours', (
               SELECT json_agg(DISTINCT extract(hour from s2.next_due_at at time zone 'UTC'))
                 FROM public.scheduled_work s2
                WHERE s2.handler_key = 'financials.billing_period_close.evaluate'
           ),
           'orgs_with_more_than_one', (
               SELECT count(*) FROM (
                   SELECT org_id FROM public.scheduled_work
                    WHERE handler_key = 'financials.billing_period_close.evaluate' AND is_active
                    GROUP BY org_id HAVING count(*) > 1
               ) d
           )
       )::text AS payload
  FROM public.scheduled_work sw
 WHERE sw.handler_key = 'financials.billing_period_close.evaluate'

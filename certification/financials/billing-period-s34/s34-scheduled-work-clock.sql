-- IS THE SCHEDULED-WORK CLOCK ACTUALLY FIRING UNATTENDED ON DEPLOYED STAGING?
--
-- `web/vercel.json` declares a cron on `/api/scheduled-work/wake` every five minutes, bearer
-- authenticated. A declaration is not a heartbeat. Automatic close is the one S3/S4 capability that
-- cannot be certified by reasoning — if this clock does not advance, automatic close would silently
-- never fire, which is the worst available failure shape because it looks exactly like "no periods
-- needed closing".
--
-- The signature being looked for is REPEATED, REGULAR, RECENT activity with no human in the loop.
-- A five-minute cadence is something only a cron produces.
--
-- Read-only.
--
-- q1  the clock row itself — whatever it records about its own advance
SELECT 'q1' AS question_id, 'row' AS kind,
       json_build_object('clock', to_jsonb(k.*))::text AS payload
FROM public.scheduled_work_clock k

UNION ALL

-- q2  does any scheduled work exist to be fired at all?
SELECT 'q2', 'row',
       json_build_object(
           'schedules', count(*),
           'enabled', count(*) FILTER (WHERE coalesce((to_jsonb(w.*) ->> 'is_enabled')::boolean, true)),
           'distinct_kinds', count(DISTINCT (to_jsonb(w.*) ->> 'work_kind'))
       )::text
FROM public.scheduled_work w

UNION ALL

-- q3  OCCURRENCES over time — the clock materialising work
SELECT 'q3', 'row',
       json_build_object(
           'occurrences', count(*),
           'earliest', min(o.created_at),
           'latest', max(o.created_at),
           'created_last_24h', count(*) FILTER (WHERE o.created_at > now() - interval '24 hours'),
           'created_last_1h', count(*) FILTER (WHERE o.created_at > now() - interval '1 hour'),
           'distinct_minutes_last_24h', count(DISTINCT date_trunc('minute', o.created_at))
               FILTER (WHERE o.created_at > now() - interval '24 hours')
       )::text
FROM public.scheduled_work_occurrences o

UNION ALL

-- q4  ATTEMPTS over time — the clock actually RUNNING handlers, which is the live question
SELECT 'q4', 'row',
       json_build_object(
           'attempts', count(*),
           'earliest', min(a.created_at),
           'latest', max(a.created_at),
           'last_24h', count(*) FILTER (WHERE a.created_at > now() - interval '24 hours'),
           'last_1h', count(*) FILTER (WHERE a.created_at > now() - interval '1 hour'),
           'minutes_since_latest', round(extract(epoch FROM (now() - max(a.created_at))) / 60.0, 1)
       )::text
FROM public.scheduled_work_attempts a

UNION ALL

-- q5  THE CADENCE FINGERPRINT. Gaps between consecutive attempt minutes: a five-minute cron leaves
--     a tight cluster at 5, which no human invocation pattern reproduces.
SELECT 'q5', 'row',
       json_build_object('gap_minutes', g.gap, 'times_observed', count(*))::text
FROM (
    SELECT round(extract(epoch FROM (t - lag(t) OVER (ORDER BY t))) / 60.0) AS gap
      FROM (
        SELECT DISTINCT date_trunc('minute', a.created_at) AS t
          FROM public.scheduled_work_attempts a
         WHERE a.created_at > now() - interval '48 hours'
      ) m
) g
WHERE g.gap IS NOT NULL
GROUP BY g.gap

UNION ALL

-- q6  what the attempts were FOR, and how they ended
SELECT 'q6', 'row',
       json_build_object(
           'work_kind', to_jsonb(o.*) ->> 'work_kind',
           'attempts', count(*),
           'outcomes', json_agg(DISTINCT to_jsonb(a.*) ->> 'status'),
           'latest', max(a.created_at)
       )::text
FROM public.scheduled_work_attempts a
LEFT JOIN public.scheduled_work_occurrences o ON o.id = (to_jsonb(a.*) ->> 'occurrence_id')::uuid
GROUP BY to_jsonb(o.*) ->> 'work_kind'

ORDER BY 1

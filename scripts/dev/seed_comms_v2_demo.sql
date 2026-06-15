-- Communications V2 — local dev demo seed (ACT-0A). IDEMPOTENT + SYNTHETIC.
-- Targets the OLDEST org by default (usually the dev/demo org). To target a specific org,
-- replace the `org` CTE body with: SELECT '<your-org-uuid>'::uuid AS id.
-- Safe to re-run: inserts only when the seed set is absent (keyed by metadata->>'seed').
-- No schema changes, no deletes; rows are tagged metadata.seed = 'comms_v2_demo'.

BEGIN;

WITH org AS (
    SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1
),
seed(label, channel, attention, assign, sla, ago) AS (
    VALUES
        ('Rivera Family','email','awaiting_parent_reply','unassigned','overdue',            interval '2 hours'),
        ('Murphy Family','sms','needs_follow_up','assigned','first_response_due',            interval '15 minutes'),
        ('Hayes Family','email','documents_missing','assigned','none',                        interval '1 hour'),
        ('Patel Family','email','re_enrollment_outreach','unassigned','none',                interval '3 hours'),
        ('Thompson Family','sms','waitlist_update','unassigned','none',                       interval '5 hours'),
        ('Johnson Family','email','needs_follow_up','unassigned','overdue',                   interval '30 minutes')
)
INSERT INTO public.communication_threads
    (org_id, primary_entity_type, primary_entity_id, channel, recipient_key,
     attention_state, assignment_state, sla_state, last_message_at, metadata)
SELECT
    org.id, 'opportunities', gen_random_uuid(), s.channel,
    lower(replace(s.label, ' ', '_')),
    s.attention, s.assign, s.sla, now() - s.ago,
    jsonb_build_object('seed', 'comms_v2_demo', 'family_label', s.label)
FROM org, seed s
WHERE NOT EXISTS (
    SELECT 1 FROM public.communication_threads t WHERE t.metadata->>'seed' = 'comms_v2_demo'
);

-- 3 messages per seeded thread (some inbound/outbound, one opened)
INSERT INTO public.communication_messages
    (org_id, thread_id, channel, direction, status, body, opened_at, created_at)
SELECT
    t.org_id, t.id, t.channel, d.direction, 'sent', d.body,
    CASE WHEN d.opened THEN t.last_message_at - d.ago ELSE NULL END,
    t.last_message_at - d.ago
FROM public.communication_threads t
CROSS JOIN (VALUES
    ('outbound','Hi — thanks for touring North Star Academy!', true,  interval '26 hours'),
    ('inbound','Thank you! We are very interested.',           false, interval '14 hours'),
    ('outbound','Wonderful — here are the next steps.',        true,  interval '2 hours')
) AS d(direction, body, opened, ago)
WHERE t.metadata->>'seed' = 'comms_v2_demo'
  AND NOT EXISTS (SELECT 1 FROM public.communication_messages m WHERE m.thread_id = t.id);

-- A couple of per-person preferences (one opted-out) for later composer/compliance QA
WITH org AS (SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1)
INSERT INTO public.communication_preferences (org_id, person_id, category, state, source, method)
SELECT org.id, gen_random_uuid(), c.category, c.state, 'seed', 'comms_v2_demo'
FROM org, (VALUES ('email_marketing','opted_out'), ('sms_marketing','opted_in')) AS c(category, state)
WHERE NOT EXISTS (
    SELECT 1 FROM public.communication_preferences p WHERE p.source = 'seed' AND p.method = 'comms_v2_demo'
);

COMMIT;

-- Report what was seeded
SELECT (SELECT id FROM public.orgs ORDER BY created_at ASC LIMIT 1) AS seeded_org,
       (SELECT count(*) FROM public.communication_threads WHERE metadata->>'seed'='comms_v2_demo') AS demo_threads,
       (SELECT count(*) FROM public.communication_messages m JOIN public.communication_threads t ON t.id=m.thread_id WHERE t.metadata->>'seed'='comms_v2_demo') AS demo_messages;

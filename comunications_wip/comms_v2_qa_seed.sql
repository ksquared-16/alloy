-- ============================================================================
-- Communications V2 — QA SEED (DRAFT — review before running; NOT auto-applied)
-- Flow: (1) apply this seed  ->  (2) test Communications UI-2  ->  (3) run the
--       matching cleanup (comms_v2_qa_cleanup.sql) to remove ONLY these rows.
--
-- Traceability: EVERY inserted thread and message carries
--       metadata->>'qa_seed_key' = 'comms-ui2-qa'
-- so the cleanup can delete exactly and only the seeded rows.
--
-- Safe by design: org-scoped, idempotent (fixed ids + ON CONFLICT DO NOTHING),
--       additive only (no UPDATE/DELETE of existing rows), single transaction.
-- Inserts: 5 communication_threads (one per operational queue) + 9 messages.
-- ============================================================================

-- Target: STAGING (project ikaxilmwmrmbagoidedu) only. Do NOT run against production.
-- Org is hardwired to Firefly Early Learning (the QA org). The conversations route
-- filters by the logged-in admin's org, so log in as a Firefly admin to see these.
\set seed_org_id '93667019-bd28-49b5-a688-acc9bb1e0a19'
\set qa_key 'comms-ui2-qa'

-- Guard: confirm the Firefly org exists on this DB before inserting (fails safely if wrong DB).
\set ON_ERROR_STOP on
SELECT CASE WHEN EXISTS (SELECT 1 FROM public.orgs WHERE id = :'seed_org_id'::uuid)
            THEN 'org ok: Firefly present'
            ELSE (1/0)::text END AS preflight;  -- aborts if the org is not on this database

BEGIN;

-- ---------------------------------------------------------------------------
-- Threads — one per operational queue. attention_state MUST equal a queue key:
--   awaiting_parent_reply | needs_follow_up | documents_missing
--   re_enrollment_outreach | waitlist_update
-- metadata carries family_label (header) + qa_seed_key (traceability).
-- ---------------------------------------------------------------------------
INSERT INTO public.communication_threads
    (id, org_id, primary_entity_type, primary_entity_id, channel, recipient_key,
     attention_state, assignment_state, sla_state, last_message_at, metadata)
VALUES
    ('c0ffee00-0000-4000-8000-000000000001', :'seed_org_id'::uuid, 'lead',
     'd0d0d000-0000-4000-8000-000000000001', 'email', 'seed:smith',
     'awaiting_parent_reply', 'unassigned', 'overdue', now() - interval '6 hours',
     jsonb_build_object('family_label','The Smith Family','qa_seed_key', :'qa_key')),

    ('c0ffee00-0000-4000-8000-000000000002', :'seed_org_id'::uuid, 'lead',
     'd0d0d000-0000-4000-8000-000000000002', 'email', 'seed:johnson',
     'needs_follow_up', 'unassigned', 'due', now() - interval '1 day',
     jsonb_build_object('family_label','The Johnson Family','qa_seed_key', :'qa_key')),

    ('c0ffee00-0000-4000-8000-000000000003', :'seed_org_id'::uuid, 'child',
     'd0d0d000-0000-4000-8000-000000000003', 'sms', 'seed:garcia',
     'documents_missing', 'unassigned', 'on_track', now() - interval '3 days',
     jsonb_build_object('family_label','The Garcia Family','qa_seed_key', :'qa_key')),

    ('c0ffee00-0000-4000-8000-000000000004', :'seed_org_id'::uuid, 'lead',
     'd0d0d000-0000-4000-8000-000000000004', 'email', 'seed:nguyen',
     're_enrollment_outreach', 'unassigned', 'on_track', now() - interval '2 days',
     jsonb_build_object('family_label','The Nguyen Family','qa_seed_key', :'qa_key')),

    ('c0ffee00-0000-4000-8000-000000000005', :'seed_org_id'::uuid, 'lead',
     'd0d0d000-0000-4000-8000-000000000005', 'sms', 'seed:park',
     'waitlist_update', 'unassigned', 'on_track', now() - interval '5 days',
     jsonb_build_object('family_label','The Park Family','qa_seed_key', :'qa_key'))
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Messages — channel-tagged, mixed direction (timeline + health). Each carries
-- qa_seed_key in metadata.  direction in ('inbound','outbound'); channel in
-- ('sms','email','in_app').
--   Smith   : outbound + inbound (responsive)
--   Johnson : outbound only x2 (no reply -> at risk)
--   Garcia  : outbound + inbound (sms)
--   Nguyen  : outbound + inbound
--   Park    : inbound only
-- ---------------------------------------------------------------------------
INSERT INTO public.communication_messages
    (id, org_id, thread_id, channel, direction, status, body, created_at, metadata)
VALUES
    ('c0ffee01-0000-4000-8000-000000000001', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000001', 'email', 'outbound', 'delivered', 'Enrollment next steps for Emma & Liam', now() - interval '1 day',   jsonb_build_object('qa_seed_key', :'qa_key')),
    ('c0ffee01-0000-4000-8000-000000000002', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000001', 'email', 'inbound',  'received',  'Is the toddler spot still open?',       now() - interval '6 hours',  jsonb_build_object('qa_seed_key', :'qa_key')),

    ('c0ffee01-0000-4000-8000-000000000003', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000002', 'email', 'outbound', 'delivered', 'Following up on your tour request',     now() - interval '1 day',   jsonb_build_object('qa_seed_key', :'qa_key')),
    ('c0ffee01-0000-4000-8000-000000000009', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000002', 'email', 'outbound', 'delivered', 'Checking in again re: your tour',       now() - interval '2 hours', jsonb_build_object('qa_seed_key', :'qa_key')),

    ('c0ffee01-0000-4000-8000-000000000004', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000003', 'sms',   'outbound', 'delivered', 'We still need the immunization record', now() - interval '4 days',  jsonb_build_object('qa_seed_key', :'qa_key')),
    ('c0ffee01-0000-4000-8000-000000000005', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000003', 'sms',   'inbound',  'received',  'Sending it over today',                 now() - interval '3 days',  jsonb_build_object('qa_seed_key', :'qa_key')),

    ('c0ffee01-0000-4000-8000-000000000006', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000004', 'email', 'outbound', 'delivered', 'Time to re-enroll for fall',            now() - interval '3 days',  jsonb_build_object('qa_seed_key', :'qa_key')),
    ('c0ffee01-0000-4000-8000-000000000007', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000004', 'email', 'inbound',  'received',  'Yes, please send the forms',            now() - interval '2 days',  jsonb_build_object('qa_seed_key', :'qa_key')),

    ('c0ffee01-0000-4000-8000-000000000008', :'seed_org_id'::uuid, 'c0ffee00-0000-4000-8000-000000000005', 'sms',   'inbound',  'received',  'Any movement on the waitlist?',         now() - interval '5 days',  jsonb_build_object('qa_seed_key', :'qa_key'))
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Verify (optional): expect 5 threads / 9 messages tagged with the seed key
--   SELECT 'threads'  AS kind, count(*) FROM public.communication_threads  WHERE metadata->>'qa_seed_key' = 'comms-ui2-qa'
--   UNION ALL
--   SELECT 'messages' AS kind, count(*) FROM public.communication_messages WHERE metadata->>'qa_seed_key' = 'comms-ui2-qa';

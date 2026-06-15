-- ============================================================================
-- Communications V2 — QA CLEANUP (DRAFT — review before running; NOT auto-applied)
-- STAGING only (project ikaxilmwmrmbagoidedu). Do NOT run against production.
--
-- Removes ONLY the QA seed rows, matched on BOTH:
--     metadata->>'qa_seed_key' = 'comms-ui2-qa'   AND   org_id = Firefly
-- The double predicate guarantees nothing outside the Firefly QA seed is touched,
-- even on a shared staging DB. Messages deleted before threads (FK order).
-- Idempotent (re-run = no-op). Single transaction. No schema changes.
-- ============================================================================

\set qa_key 'comms-ui2-qa'
\set seed_org_id '93667019-bd28-49b5-a688-acc9bb1e0a19'

-- Preview what will be removed (optional, run first):
--   SELECT 'threads'  AS kind, count(*) FROM public.communication_threads
--     WHERE metadata->>'qa_seed_key' = :'qa_key' AND org_id = :'seed_org_id'::uuid
--   UNION ALL
--   SELECT 'messages' AS kind, count(*) FROM public.communication_messages
--     WHERE metadata->>'qa_seed_key' = :'qa_key' AND org_id = :'seed_org_id'::uuid;

BEGIN;

-- 1) messages first (child of threads)
DELETE FROM public.communication_messages
WHERE metadata->>'qa_seed_key' = :'qa_key'
  AND org_id = :'seed_org_id'::uuid;

-- 2) then threads
DELETE FROM public.communication_threads
WHERE metadata->>'qa_seed_key' = :'qa_key'
  AND org_id = :'seed_org_id'::uuid;

COMMIT;

-- Verify removal (optional): both counts should be 0
--   SELECT 'threads'  AS kind, count(*) FROM public.communication_threads
--     WHERE metadata->>'qa_seed_key' = 'comms-ui2-qa' AND org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19'
--   UNION ALL
--   SELECT 'messages' AS kind, count(*) FROM public.communication_messages
--     WHERE metadata->>'qa_seed_key' = 'comms-ui2-qa' AND org_id = '93667019-bd28-49b5-a688-acc9bb1e0a19';

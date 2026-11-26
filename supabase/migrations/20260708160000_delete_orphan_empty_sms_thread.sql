-- Remove orphaned empty SMS thread left after staging test message cleanup (0 messages).
-- Safe: only deletes when no communication_messages rows remain on the thread.
DELETE FROM public.communication_threads t
WHERE t.id = 'ea450c33-5f2a-4ccc-a322-c15cdbc86d84'
  AND NOT EXISTS (
    SELECT 1
    FROM public.communication_messages m
    WHERE m.thread_id = t.id
  );

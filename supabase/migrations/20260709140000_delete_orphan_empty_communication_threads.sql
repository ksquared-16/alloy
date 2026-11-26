-- Remove orphaned communication threads with zero messages (staging activation/test cleanup).
-- Safe: only deletes threads with no communication_messages rows.
DELETE FROM public.communication_threads t
WHERE NOT EXISTS (
    SELECT 1
    FROM public.communication_messages m
    WHERE m.thread_id = t.id
);

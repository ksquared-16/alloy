-- Messaging V2 Sprint A — inbox foundation columns on communication_threads.
-- Adds archived_at + last_message_at with indexes and message-insert trigger.

ALTER TABLE public.communication_threads
    ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL,
    ADD COLUMN IF NOT EXISTS last_message_at timestamptz NULL;

COMMENT ON COLUMN public.communication_threads.archived_at IS
    'When set, thread appears in Inbox Archived folder only (org-scoped).';
COMMENT ON COLUMN public.communication_threads.last_message_at IS
    'Denormalized latest communication_messages.created_at for org inbox sort.';

-- Backfill from existing messages (threads without messages keep NULL → UI falls back to updated_at).
UPDATE public.communication_threads t
SET last_message_at = sub.max_created
FROM (
    SELECT thread_id, MAX(created_at) AS max_created
    FROM public.communication_messages
    GROUP BY thread_id
) sub
WHERE t.id = sub.thread_id
  AND t.last_message_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_threads_org_inbox_active
    ON public.communication_threads (org_id, last_message_at DESC NULLS LAST, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_threads_org_inbox_archived
    ON public.communication_threads (org_id, last_message_at DESC NULLS LAST, updated_at DESC)
    WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_communication_thread_last_message_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE public.communication_threads
    SET last_message_at = NEW.created_at,
        updated_at = NOW()
    WHERE id = NEW.thread_id;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.bump_communication_thread_last_message_at() IS
    'Keeps communication_threads.last_message_at in sync on new communication_messages rows.';

DROP TRIGGER IF EXISTS trg_comm_messages_bump_thread_last_message ON public.communication_messages;
CREATE TRIGGER trg_comm_messages_bump_thread_last_message
    AFTER INSERT ON public.communication_messages
    FOR EACH ROW
    EXECUTE FUNCTION public.bump_communication_thread_last_message_at();

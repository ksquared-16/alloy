-- Unread stops being a guess about the last 300 messages.
--
-- The previous implementation fetched the 300 most recent inbound message ids,
-- fetched read rows for those ids, and counted the difference in JavaScript. Past
-- 300 unread it silently under-reported: an operator returning to a busy tenant
-- would be told they had 300 unread replies when they had more, and the number
-- would stop moving as it got worse. It also cost two round trips and grew with
-- the cap rather than with the answer.
--
-- Replacing 300 with a larger constant would only move the lie further out. The
-- fix is to let the database answer the question it is built to answer: count
-- inbound messages with no read row for this user. `communication_message_reads`
-- is already keyed PRIMARY KEY (message_id, user_id), so the anti-join has an
-- exact index available and never scans the read table.
--
-- SECURITY DEFINER with an explicit org argument: the caller has already
-- established org context, and the function is granted only to authenticated.
-- search_path is pinned so a definer function cannot be redirected.

BEGIN;

-- The anti-join drives from messages; this is the index that keeps that cheap as
-- a tenant's inbound history grows.
CREATE INDEX IF NOT EXISTS idx_comm_msgs_org_inbound_created
    ON public.communication_messages (org_id, created_at DESC)
    WHERE direction = 'inbound';

CREATE OR REPLACE FUNCTION public.communication_unread_count(
    p_org_id uuid,
    p_user_id uuid
)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT count(*)::bigint
    FROM public.communication_messages m
    WHERE m.org_id = p_org_id
      AND m.direction = 'inbound'
      AND NOT EXISTS (
          SELECT 1
          FROM public.communication_message_reads r
          WHERE r.message_id = m.id
            AND r.user_id = p_user_id
      );
$$;

COMMENT ON FUNCTION public.communication_unread_count(uuid, uuid) IS
    'Exact count of inbound messages with no read row for this user. Replaces a bounded 300-row scan that under-reported past the cap.';

REVOKE ALL ON FUNCTION public.communication_unread_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.communication_unread_count(uuid, uuid) TO authenticated, service_role;

COMMIT;

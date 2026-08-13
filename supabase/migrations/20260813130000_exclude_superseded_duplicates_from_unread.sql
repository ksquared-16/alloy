-- Superseded duplicates are history, not unread replies.
--
-- Migration 20260813100000 deliberately kept pre-index duplicate inbound rows —
-- a received communication is immutable history even when it arrived twice — and
-- only moved their provider identity into metadata so the new uniqueness index
-- could be created.
--
-- Those rows are still `direction = 'inbound'`, so every inbound-counting query
-- sees them. Left alone they would tell an operator they have unread replies that
-- are really the same message counted twice, which is precisely the duplication
-- this slice set out to remove — reappearing one layer up.
--
-- The rows stay. They are excluded from the *count*, which is a presentation
-- decision, not a deletion.

BEGIN;

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
      -- A duplicate that surrendered its provider identity during backfill is the
      -- same message the operator already has, not another one.
      AND m.metadata->>'superseded_duplicate_provider_message_id' IS NULL
      AND NOT EXISTS (
          SELECT 1
          FROM public.communication_message_reads r
          WHERE r.message_id = m.id
            AND r.user_id = p_user_id
      );
$$;

COMMENT ON FUNCTION public.communication_unread_count(uuid, uuid) IS
    'Exact count of inbound messages with no read row for this user, excluding rows superseded as duplicate provider deliveries. Replaces a bounded 300-row scan that under-reported past the cap.';

REVOKE ALL ON FUNCTION public.communication_unread_count(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.communication_unread_count(uuid, uuid) TO authenticated, service_role;

COMMIT;

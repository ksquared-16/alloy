-- Communications V2 — Phase 1 / B7: generalize the SINGLE scheduler for announcements.
-- ADDITIVE / RELAXING ONLY. Existing task_assist + tour_scheduling rows are unaffected
-- (they keep entity_id + entity_type='opportunities'). NO second scheduler, NO new
-- execution table, NO provider activation. Announcement execution (actual provider send)
-- is intentionally GATED OFF in the due-claim until Phase 3.

-- 1) communication_scheduled_sends: allow source='announcement' + announcement linkage,
--    relax the opportunity coupling so announcement rows (no opportunity) are legal.
ALTER TABLE public.communication_scheduled_sends
    DROP CONSTRAINT IF EXISTS communication_scheduled_sends_source_check;
ALTER TABLE public.communication_scheduled_sends
    ADD CONSTRAINT communication_scheduled_sends_source_check
    CHECK (source = ANY (ARRAY['task_assist'::text, 'tour_scheduling'::text, 'announcement'::text]));

ALTER TABLE public.communication_scheduled_sends
    DROP CONSTRAINT IF EXISTS communication_scheduled_sends_entity_type_check;
ALTER TABLE public.communication_scheduled_sends
    ADD CONSTRAINT communication_scheduled_sends_entity_type_check
    CHECK (entity_type = ANY (ARRAY['opportunities'::text, 'announcements'::text]));

ALTER TABLE public.communication_scheduled_sends
    ALTER COLUMN entity_id DROP NOT NULL;

ALTER TABLE public.communication_scheduled_sends
    ADD COLUMN IF NOT EXISTS announcement_id uuid NULL
        REFERENCES public.announcements (id) ON DELETE CASCADE;

-- Consistency: opportunity sources keep their opportunity entity; the announcement source
-- carries announcement_id and entity_type='announcements' (and no opportunity entity_id).
ALTER TABLE public.communication_scheduled_sends
    DROP CONSTRAINT IF EXISTS comm_sched_sends_source_entity_chk;
ALTER TABLE public.communication_scheduled_sends
    ADD CONSTRAINT comm_sched_sends_source_entity_chk CHECK (
        (source = 'announcement' AND announcement_id IS NOT NULL AND entity_type = 'announcements')
        OR (source = ANY (ARRAY['task_assist'::text, 'tour_scheduling'::text])
            AND entity_id IS NOT NULL AND entity_type = 'opportunities')
    );

CREATE INDEX IF NOT EXISTS idx_comm_sched_sends_announcement
    ON public.communication_scheduled_sends (announcement_id, status)
    WHERE announcement_id IS NOT NULL;

-- 2) Gate the due-claim to the sources that have a live execution handler today.
--    Announcement rows are created by the fan-out but are NOT auto-executed until the
--    Phase-3 send wiring exists — this prevents the existing cron from sending them.
--    task_assist + tour_scheduling behavior is byte-for-byte unchanged.
CREATE OR REPLACE FUNCTION public.claim_due_communication_scheduled_sends(
    p_limit integer,
    p_now timestamptz,
    p_org_id uuid DEFAULT NULL
)
RETURNS SETOF public.communication_scheduled_sends
LANGUAGE plpgsql
VOLATILE
AS $function$
BEGIN
    IF p_limit IS NULL OR p_limit < 1 THEN
        RAISE EXCEPTION 'claim_due_communication_scheduled_sends: p_limit must be >= 1';
    END IF;

    RETURN QUERY
    WITH picked AS (
        SELECT css.id
        FROM public.communication_scheduled_sends AS css
        WHERE css.status = 'pending'::text
          AND css.scheduled_for <= p_now
          AND css.communication_message_id IS NULL
          AND css.source = ANY (ARRAY['task_assist'::text, 'tour_scheduling'::text])  -- announcement execution: Phase 3
          AND (p_org_id IS NULL OR css.org_id = p_org_id)
        ORDER BY css.scheduled_for ASC, css.id ASC
        FOR UPDATE OF css SKIP LOCKED
        LIMIT p_limit
    ),
    updated AS (
        UPDATE public.communication_scheduled_sends AS t
        SET
            status = 'claimed'::text,
            claim_token = gen_random_uuid(),
            claimed_at = p_now,
            updated_at = now()
        FROM picked
        WHERE t.id = picked.id
        RETURNING t.*
    )
    SELECT * FROM updated;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_due_communication_scheduled_sends(integer, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_due_communication_scheduled_sends(integer, timestamptz, uuid) TO service_role;

-- 3) announcement_recipients.status is a CAMPAIGN OUTCOME ROLLUP, not a queue.
--    Redefine the vocabulary (queued → scheduled) and back-link to the execution row.
--    Safe: no rows exist yet (no writer before B7).
ALTER TABLE public.announcement_recipients
    DROP CONSTRAINT IF EXISTS announcement_recipients_status_check;
ALTER TABLE public.announcement_recipients
    ADD CONSTRAINT announcement_recipients_status_check
    CHECK (status IN ('pending', 'scheduled', 'skipped', 'sent', 'failed'));

ALTER TABLE public.announcement_recipients
    ADD COLUMN IF NOT EXISTS communication_scheduled_send_id uuid NULL
        REFERENCES public.communication_scheduled_sends (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.communication_scheduled_sends.announcement_id IS
    'B7: links an announcement fan-out execution row to its campaign. Single scheduler — no separate announcement execution table.';
COMMENT ON COLUMN public.announcement_recipients.status IS
    'B7: campaign OUTCOME rollup (pending|scheduled|skipped|sent|failed) derived from the execution row — NOT an execution queue.';
COMMENT ON COLUMN public.announcement_recipients.communication_scheduled_send_id IS
    'B7: back-link to the communication_scheduled_sends execution row (null for skipped/in_app).';

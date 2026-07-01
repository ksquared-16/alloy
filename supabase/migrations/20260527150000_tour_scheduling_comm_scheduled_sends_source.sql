-- Tour Scheduling Phase 2 Band A (Batch 1):
-- - Allow communication_scheduled_sends.source = 'tour_scheduling'
-- - Partial unique index for tour reminder dedupe (metadata tour_booking_id + reminder_key)

ALTER TABLE public.communication_scheduled_sends
    DROP CONSTRAINT IF EXISTS communication_scheduled_sends_source_check;

ALTER TABLE public.communication_scheduled_sends
    ADD CONSTRAINT communication_scheduled_sends_source_check
    CHECK (source = ANY (ARRAY['task_assist'::text, 'tour_scheduling'::text]));

COMMENT ON CONSTRAINT communication_scheduled_sends_source_check ON public.communication_scheduled_sends IS
    'task_assist: Task Assist approved sends; tour_scheduling: tour reminder orchestration (Band A).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_comm_sched_sends_tour_reminder_dedupe
    ON public.communication_scheduled_sends (
        org_id,
        entity_id,
        (metadata ->> 'tour_booking_id'),
        (metadata ->> 'reminder_key'),
        channel
    )
    WHERE source = 'tour_scheduling'::text
      AND status = ANY (ARRAY['pending'::text, 'claimed'::text])
      AND coalesce(trim(metadata ->> 'tour_booking_id'), '') <> ''
      AND coalesce(trim(metadata ->> 'reminder_key'), '') <> '';

COMMENT ON INDEX public.ux_comm_sched_sends_tour_reminder_dedupe IS
    'One pending/claimed tour reminder per org, opportunity, booking, reminder_key, and channel.';

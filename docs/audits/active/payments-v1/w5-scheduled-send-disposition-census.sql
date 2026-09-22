-- Payments V1 · W5 — HOW DID TEN ROWS LEAVE 'pending' IF NOTHING EVER CLAIMED ONE? Read only, ONE statement.
--
-- The first W5 census measured `communication_scheduled_sends`: 11 rows, 1 pending and 37 days
-- overdue, `claimed_at` never set on any row, yet 10 rows no longer in 'pending'. Those two facts
-- must be reconciled before concluding anything about a clock.
--
-- `process-due` is the only claiming path and it stamps `claimed_at`, so a drain by the due-queue
-- processor is already excluded. But "left pending" could still mean SENT by some other route, and
-- a platform that sends scheduled messages on time by some other mechanism is a platform with a
-- clock this inventory has not found. If instead those rows are 'canceled' or 'failed', nothing
-- ever fired and the absence is real.
--
-- The status breakdown is the whole question, so it is what this asks.
select
    'w5_send_disposition' as question_id,
    'row' as kind,
    json_build_object(
        'by_status',            (select json_object_agg(status, n) from (
                                    select status, count(*) as n
                                    from public.communication_scheduled_sends group by status) s),
        'sent_count',           (select count(*) from public.communication_scheduled_sends where status='sent'),
        'canceled_count',       (select count(*) from public.communication_scheduled_sends where status='canceled'),
        'failed_count',         (select count(*) from public.communication_scheduled_sends where status='failed'),
        -- A row that genuinely SENT carries a message id. Nothing enqueued means nothing fired.
        'with_message_id',      (select count(*) from public.communication_scheduled_sends where communication_message_id is not null),
        'claim_token_ever_set', (select count(*) from public.communication_scheduled_sends where claim_token is not null),
        -- Did any row leave 'pending' AFTER its due time (the signature of an on-time processor),
        -- or only before it (the signature of a human cancelling ahead of the send)?
        'left_pending_after_due',  (select count(*) from public.communication_scheduled_sends
                                      where status <> 'pending' and updated_at > scheduled_for),
        'left_pending_before_due', (select count(*) from public.communication_scheduled_sends
                                      where status <> 'pending' and updated_at <= scheduled_for),
        'newest_scheduled_for', (select max(scheduled_for)::text from public.communication_scheduled_sends),
        'newest_updated_at',    (select max(updated_at)::text from public.communication_scheduled_sends)
    )::text as payload;

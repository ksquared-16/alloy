-- Phase 0 / P0-1 (commit 4) — deterministic dispatch deferral.
--
-- SMALLEST REQUIRED CORRECTION, proposed and explained rather than assumed.
--
-- PROBLEM
-- Dispatch-time revalidation can conclude "not now" rather than "never": a
-- message that entered the queue outside quiet hours may be due for dispatch
-- while inside them. The queue has no way to express that.
--
-- The poller is exactly:
--     direction=eq.outbound & status=eq.queued & order=created_at.asc
--   (backend/app/services/communication_message_sender.py:120-126)
--
-- With no next-attempt concept, a quiet-hours block leaves only bad options:
--   * mark it failed          -> a legitimate message is permanently lost
--   * leave it queued         -> every drain re-evaluates and re-blocks it,
--                               forever, with no deterministic next attempt
--                               (explicitly ruled out)
--
-- CORRECTION
-- One nullable column and one index. No status CHECK is added here: the status
-- vocabulary is currently free text written by four runtimes, and constraining
-- it before every writer is enumerated would be a separate, riskier change.
-- That belongs in the closeout hygiene migration.
--
-- New status values used by the dispatcher (no constraint yet):
--   'deferred' — policy says not now; deferred_until carries the next attempt
--   'blocked'  — policy says never; terminal, and NOT a provider failure
--
-- Deliberately NOT included: retry counters, backoff, dead-letter, or queue
-- leasing. Those are Phase 2 (send pipeline) and are out of scope here.

ALTER TABLE public.communication_messages
    ADD COLUMN IF NOT EXISTS deferred_until timestamptz NULL;

-- The poller reads (queued OR deferred-and-due). This index serves that scan
-- without disturbing the existing idx_comm_msgs_queue partial index.
CREATE INDEX IF NOT EXISTS idx_comm_msgs_deferred_due
    ON public.communication_messages (deferred_until)
    WHERE direction = 'outbound' AND deferred_until IS NOT NULL;

COMMENT ON COLUMN public.communication_messages.deferred_until IS
    'Deterministic next-attempt time for a policy-DEFERRED message (e.g. quiet hours). NULL for queued rows. A deferred message is not failed: it is preserved for later dispatch. Set by the Python dispatch revalidation; read by the queue poller.';

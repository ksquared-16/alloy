-- =============================================================================
-- THE EVENT LEDGER STILL CARRIED AN AUTHOR THAT NO LONGER EXISTS.
--
-- `attendance_integration_events.producer_id` named the legacy Attendance
-- integration producer that authored an inbound event. Thread 5 B.6 retired that
-- authority: ingestion now takes an already-resolved `AttendanceIngestAuthor`
-- derived from an installation, accepts no credential, and performs no producer
-- lookup. The column has been written NULL on every path since that slice.
--
-- WHY DROP IT RATHER THAN LEAVE IT NULL.
--
-- A nullable column with a live foreign key is not inert. It keeps
-- `attendance_integration_producers` undroppable, it keeps a second author
-- identity in the shape so a future writer can "just set producer_id", and it
-- makes the single-author CHECK look like a live rule when only one author
-- column can ever be populated. Retiring the model means retiring the column it
-- authored through.
--
-- MEASURED, NOT ASSUMED. Two governed censuses of `alloy_deployed_primary`
-- (2026-09-11 and 2026-09-13, same target fingerprint) each returned zero
-- producers, zero producer sites, zero mappings and zero producer-attributed
-- events. There is no row whose author this drop would forget.
--
-- WHAT MUST SURVIVE, AND DOES.
--
-- Event identity for the converged path is `uq_integration_event_installation`
-- (provider_key, provider_event_id, installation_id), which already exists and
-- is untouched here. Correlation is owned by `integration_resource_refs`.
--
-- `uq_integration_event_unattributed` has to be restated rather than dropped.
-- It exists so that an inbound event nobody could attribute is still recorded
-- exactly once, and its predicate names both author columns. With one author
-- column left, the same rule is "no installation", and historical unattributed
-- rows keep the identical guarantee. The `unattributed` disposition itself stays
-- in the CHECK vocabulary: the current seam no longer produces it, but rows that
-- already carry it are history and history is not rewritten here.
--
-- The single-author CHECK goes. It enforced mutual exclusion between two author
-- columns; with one column it is a tautology, and a tautology that reads like a
-- rule is worse than no rule.
-- =============================================================================

-- The producer-scoped identity index dies with the column it scopes.
DROP INDEX IF EXISTS public.uq_integration_event_identity;

-- Restate the unattributed guarantee in terms of the only author that remains.
DROP INDEX IF EXISTS public.uq_integration_event_unattributed;
CREATE UNIQUE INDEX uq_integration_event_unattributed
    ON public.attendance_integration_events (provider_key, provider_event_id)
    WHERE (installation_id IS NULL);

-- A tautology is not an invariant.
ALTER TABLE public.attendance_integration_events
    DROP CONSTRAINT IF EXISTS attendance_integration_events_single_author;

-- The last structural tie from the event ledger to the producer model.
ALTER TABLE public.attendance_integration_events
    DROP CONSTRAINT IF EXISTS attendance_integration_events_producer_id_fkey;

ALTER TABLE public.attendance_integration_events
    DROP COLUMN IF EXISTS producer_id;

COMMENT ON COLUMN public.attendance_integration_events.installation_id IS
    'The sole author of an inbound external attendance event. The legacy producer_id column was dropped in 20260913160000 after two governed censuses showed no producer, no producer site, no mapping and no producer-attributed event remained. Identity is (provider_key, provider_event_id, installation_id); an event nobody could attribute has installation_id NULL and is still recorded exactly once.';

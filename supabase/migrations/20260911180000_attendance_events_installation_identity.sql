-- Attendance evidence must be able to name a Developer Platform author.
--
-- ── WHY THIS IS NEEDED BEFORE THE REWIRE ──
--
-- `attendance_integration_events` identifies the author of an inbound event by
-- `producer_id`, a foreign key into the legacy `attendance_integration_producers`
-- table. A Developer Platform installation has no row there and never will --
-- that is the whole point of G-14 -- so the obvious move is to leave
-- `producer_id` null and carry provenance in `presented_producer_key`.
--
-- That would be wrong, and quietly so. The table's uniqueness is two PARTIAL
-- indexes:
--
--   uq_integration_event_identity      (provider_key, provider_event_id, producer_id)
--                                      WHERE producer_id IS NOT NULL
--   uq_integration_event_unattributed  (provider_key, provider_event_id)
--                                      WHERE producer_id IS NULL
--
-- A null `producer_id` therefore means UNATTRIBUTED: "a credential we do not
-- recognise tried to author attendance". An installation-authored event is the
-- opposite -- fully attributed, to an authority the Developer Platform owns.
-- Filing it in the unattributed bucket would both lie about its provenance and
-- collide two different installations that happen to send the same
-- `provider_event_id`, silently discarding one organisation's event because
-- another organisation had already used that id.
--
-- So the author gets its own column and its own uniqueness. Three states, each
-- meaning exactly one thing:
--
--   producer_id NOT NULL                      legacy producer authored it
--   installation_id NOT NULL                  a Developer Platform installation authored it
--   both NULL                                 nobody could be established
--
-- Idempotency is per author, which is what "one inbound event is one row"
-- has always meant here -- it is now simply true for both kinds of author.

ALTER TABLE public.attendance_integration_events
    ADD COLUMN IF NOT EXISTS installation_id uuid REFERENCES public.app_installations(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.attendance_integration_events.installation_id IS
    'The Developer Platform installation that authored this event, when the author is an application principal rather than a legacy producer. Mutually exclusive with producer_id.';

-- Two authors for one event is not a state this table should be able to hold.
ALTER TABLE public.attendance_integration_events
    DROP CONSTRAINT IF EXISTS attendance_integration_events_single_author;
ALTER TABLE public.attendance_integration_events
    ADD CONSTRAINT attendance_integration_events_single_author
    CHECK (producer_id IS NULL OR installation_id IS NULL);

-- Installation-authored events are unique per installation, exactly as producer
-- authored events are unique per producer.
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_event_installation
    ON public.attendance_integration_events (provider_key, provider_event_id, installation_id)
    WHERE installation_id IS NOT NULL;

-- Unattributed now means what it says: no author of EITHER kind could be
-- established. Without narrowing this, every installation-authored event would
-- still be caught by the old predicate.
DROP INDEX IF EXISTS public.uq_integration_event_unattributed;
CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_event_unattributed
    ON public.attendance_integration_events (provider_key, provider_event_id)
    WHERE producer_id IS NULL AND installation_id IS NULL;

-- The operational read: what has this installation sent, most recent first.
CREATE INDEX IF NOT EXISTS idx_integration_event_installation
    ON public.attendance_integration_events (installation_id, received_at DESC)
    WHERE installation_id IS NOT NULL;

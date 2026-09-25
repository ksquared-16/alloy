-- Space archive lifecycle.
--
-- A Space can already be deactivated, which means "configured, but not in use
-- right now" — a classroom closed for the summer that will come back. It could
-- not be RETIRED: a mistakenly created space, or a certification specimen, stayed
-- in the configured collection forever, and eleven of them proved it.
--
-- Archive is the third state, and it is deliberately NOT another spelling of
-- is_active = false:
--
--   is_active = true,  archived_at null  ACTIVE    in use now
--   is_active = false, archived_at null  INACTIVE  configured, paused, still listed
--   archived_at set                      ARCHIVED  out of current configuration
--
-- `archived_at` rather than a status vocabulary, because it is already the
-- platform's record-archive primitive: persons, contacts, jobs, announcements,
-- communication_threads and processing_cases all carry this exact column. The
-- unused `locations.status_key` is left alone — a second vocabulary for the same
-- idea is how two answers to "is this thing retired" get born.
--
-- The row is never deleted. Ids stay resolvable so historical attendance,
-- placements and schedules keep their labels.

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.locations.archived_at IS
    'When this location left current configuration. NULL = not archived. Archive is durable retirement, distinct from is_active=false, which means configured but paused. Rows are never deleted; historical references stay resolvable.';

-- Every ordinary read asks for the not-archived set, so that is what gets the index.
CREATE INDEX IF NOT EXISTS idx_locations_org_active_not_archived
    ON public.locations (org_id, location_type)
    WHERE archived_at IS NULL;

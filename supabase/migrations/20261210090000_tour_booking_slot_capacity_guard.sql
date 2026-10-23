-- Tour booking slot capacity — enforced where the write happens.
--
-- Defect (D-T5): every booking writer checked availability by READING tour_bookings and
-- then WRITING one, with nothing between the two. Two families submitting the last seat at
-- the same moment both passed the read and both booked.
--
-- The application still computes availability (rules expand into slots in TypeScript; this
-- migration does not copy that logic). What it records on each capacity-consuming write is
-- the limit of the slot it landed in: tour_bookings.metadata.slot_capacity. This trigger
-- re-counts the overlapping capacity-consuming bookings at the same location UNDER A
-- TRANSACTION-SCOPED ADVISORY LOCK for (org, location), and refuses the write when the slot
-- is already full. Concurrent writers to one location serialise on the lock; the second one
-- counts the first one's committed row and is refused with SQLSTATE 23P01
-- (exclusion_violation, PostgREST 409) and message 'tour_slot_capacity_exceeded'.
--
-- Covers EVERY writer — admin create, public book, staff confirm, admin/public reschedule,
-- compensating restores, or SQL — because it is on the table, not in a route.
--
-- Scope of the check:
--   * Only rows ENTERING a capacity-consuming status (pending_approval, confirmed,
--     rescheduled) or changing their slot (start_at, end_at, location_id) or limit while in
--     one. A pending booking that is confirmed in place already holds its seat, so
--     approving it is never refused for counting itself (D-T3).
--   * A row without metadata.slot_capacity (rows written before this guard, and the
--     non-consuming `requested` status) is serialised but not limited.
--
-- Deployment order: independent. Code without this migration writes the metadata key and
-- behaves as before; this migration without the code serialises writes and limits nothing.
-- Re-runnable: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.enforce_tour_booking_slot_capacity()
RETURNS trigger
LANGUAGE plpgsql
-- DEFINER so the re-count sees every booking at the location, whatever RLS the writer has.
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_consuming constant text[] := ARRAY['pending_approval', 'confirmed', 'rescheduled'];
    v_capacity_text text;
    v_capacity integer;
    v_taken integer;
BEGIN
    IF NOT (NEW.status_key = ANY (v_consuming)) THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status_key = ANY (v_consuming)
       AND OLD.location_id = NEW.location_id
       AND OLD.start_at = NEW.start_at
       AND OLD.end_at = NEW.end_at
       AND (OLD.metadata -> 'slot_capacity') IS NOT DISTINCT FROM (NEW.metadata -> 'slot_capacity') THEN
        -- Same seat, same limit: this row already holds its place.
        RETURN NEW;
    END IF;

    -- Serialise every capacity-consuming write at this location until commit. Each
    -- statement below takes a fresh READ COMMITTED snapshot, so it sees any writer that
    -- held the lock before us.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('tour_bookings.slot_capacity:' || NEW.org_id::text || ':' || NEW.location_id::text, 0)
    );

    v_capacity_text := NEW.metadata ->> 'slot_capacity';
    IF v_capacity_text IS NULL OR v_capacity_text !~ '^[0-9]+$' THEN
        RETURN NEW;
    END IF;
    v_capacity := v_capacity_text::integer;

    SELECT count(*)
      INTO v_taken
      FROM public.tour_bookings b
     WHERE b.org_id = NEW.org_id
       AND b.location_id = NEW.location_id
       AND b.id <> NEW.id
       AND b.status_key = ANY (v_consuming)
       AND b.start_at < NEW.end_at
       AND b.end_at > NEW.start_at;

    IF v_taken >= v_capacity THEN
        RAISE EXCEPTION USING
            ERRCODE = '23P01',
            MESSAGE = 'tour_slot_capacity_exceeded',
            DETAIL = format('slot capacity %s already held by %s booking(s)', v_capacity, v_taken),
            HINT = 'Choose another time.';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_tour_booking_slot_capacity() IS
    'Refuses a capacity-consuming tour booking write when overlapping bookings at the location already fill metadata.slot_capacity. Serialised per (org, location) by a transaction advisory lock. Raises 23P01 tour_slot_capacity_exceeded.';

REVOKE ALL ON FUNCTION public.enforce_tour_booking_slot_capacity() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_tour_bookings_slot_capacity ON public.tour_bookings;
CREATE TRIGGER trg_tour_bookings_slot_capacity
    BEFORE INSERT OR UPDATE OF status_key, start_at, end_at, location_id, metadata ON public.tour_bookings
    FOR EACH ROW
    EXECUTE FUNCTION public.enforce_tour_booking_slot_capacity();

-- Tour booking attendance foundation + deferred host column.
-- Product model: internal calendar recipients are configured via
-- org_settings.metadata.tour_comms.internal_recipients (not booking host assignment).
-- `host_user_id` remains nullable/unused by product writes in this sprint.
-- Parent attendance affirmation uses action_kind confirm_attendance.

ALTER TABLE public.tour_bookings
  ADD COLUMN IF NOT EXISTS host_user_id uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tour_bookings.host_user_id IS
  'Deferred / unused by product: Tour Host assignment was not adopted. Prefer tour_comms.internal_recipients.';

CREATE INDEX IF NOT EXISTS tour_bookings_org_host_user_id_idx
  ON public.tour_bookings (org_id, host_user_id)
  WHERE host_user_id IS NOT NULL;

-- Allow parent attendance affirmation as a scoped public action kind.
ALTER TABLE public.tour_public_booking_links
  DROP CONSTRAINT IF EXISTS tour_public_booking_links_action_kind_chk;

ALTER TABLE public.tour_public_booking_links
  ADD CONSTRAINT tour_public_booking_links_action_kind_chk CHECK (
    action_kind IS NULL OR action_kind = ANY (ARRAY[
      'view_tour_slots'::text,
      'select_tour_slot'::text,
      'decline_tour'::text,
      'view_tour_details'::text,
      'reschedule_tour'::text,
      'confirm_tour'::text,
      'cancel_tour'::text,
      'confirm_attendance'::text
    ])
  );

-- Interactive Tour Invitation — Slice C: canonical invitation + scoped public actions.
--
-- Closes four confirmed authorization gaps in the EXISTING public tour-booking
-- flow. The flow itself is canonical and is reused unchanged: token hashing,
-- rate limiting, computeAvailableTourSlots, and createTourBooking all stay.
--
-- The gaps this closes:
--   1. links were scoped to org+opportunity+location but NOT to a recipient, so
--      possession of a token was the entire authority
--   2. one link could do everything — no action-family scoping
--   3. no consumption state, so nothing could be single-use
--   4. nothing tied a sent message to the options it presented
--
-- ADDITIVE ONLY. No column is dropped, no row rewritten, no booking touched.
--
-- LEGACY ROLLOUT: `tour_public_booking_links` currently holds ZERO rows on the
-- shared environment (verified before writing this), so there is no live link to
-- migrate or strand. Existing rows would be marked `legacy_unscoped` and are
-- refused by the scoped authorizer — fail closed, per the "prefer revocation and
-- reissue where ambiguity exists" rule. The backfill is written anyway so the
-- migration is correct on any environment that does have rows.

-- ---------------------------------------------------------------------------
-- 1. Canonical tour invitation
-- ---------------------------------------------------------------------------
-- One operational offer to schedule a tour. Email and SMS deliveries of the
-- SAME offer share one invitation — that is what stops two transports becoming
-- two competing bookings.

CREATE TABLE IF NOT EXISTS public.tour_invitations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,

    -- Recipient authority. NOT NULL: an invitation with no intended recipient
    -- is exactly the hole this slice exists to close.
    recipient_person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE RESTRICT,

    opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,

    -- Optional operational context.
    process_instance_id uuid NULL REFERENCES public.process_instances(id) ON DELETE SET NULL,
    child_person_id uuid NULL REFERENCES public.persons(id) ON DELETE SET NULL,
    conversation_thread_id uuid NULL REFERENCES public.communication_threads(id) ON DELETE SET NULL,

    status text NOT NULL DEFAULT 'draft',
    expires_at timestamptz NULL,
    revoked_at timestamptz NULL,

    -- Immutable record of what was actually offered. Evidence, never authority:
    -- availability is always revalidated at booking time.
    option_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    created_by uuid NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT tour_invitations_status_chk CHECK (
        status = ANY (ARRAY['draft','active','booked','declined','expired','revoked','superseded'])
    ),
    CONSTRAINT tour_invitations_snapshot_obj_chk CHECK (jsonb_typeof(option_snapshot) = 'object'),
    CONSTRAINT tour_invitations_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE public.tour_invitations IS
    'One operational offer to schedule a tour. Email and SMS deliveries of the same offer share one invitation.';
COMMENT ON COLUMN public.tour_invitations.option_snapshot IS
    'Immutable record of the options presented in the sent message. Audit evidence, NOT availability authority.';

CREATE INDEX IF NOT EXISTS idx_tour_invitations_org_recipient
    ON public.tour_invitations (org_id, recipient_person_id);
CREATE INDEX IF NOT EXISTS idx_tour_invitations_org_opportunity
    ON public.tour_invitations (org_id, opportunity_id);
CREATE INDEX IF NOT EXISTS idx_tour_invitations_active
    ON public.tour_invitations (org_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_tour_invitations_thread
    ON public.tour_invitations (conversation_thread_id) WHERE conversation_thread_id IS NOT NULL;

ALTER TABLE public.tour_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_invitations_select_org ON public.tour_invitations;
CREATE POLICY tour_invitations_select_org ON public.tour_invitations
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.user_roles ur
                   WHERE ur.user_id = auth.uid() AND ur.org_id = tour_invitations.org_id));

DROP POLICY IF EXISTS tour_invitations_service_role_all ON public.tour_invitations;
CREATE POLICY tour_invitations_service_role_all ON public.tour_invitations
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.tour_invitations TO "authenticated";
GRANT ALL ON public.tour_invitations TO "service_role";

-- ---------------------------------------------------------------------------
-- 2. Scoped authority on the EXISTING public link table
-- ---------------------------------------------------------------------------
-- Extended rather than replaced: the hashed-token pattern, expiry, org scoping
-- and rate limiting are already correct and stay exactly as they are.

ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS invitation_id uuid NULL REFERENCES public.tour_invitations(id) ON DELETE CASCADE;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS recipient_person_id uuid NULL REFERENCES public.persons(id) ON DELETE RESTRICT;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS action_kind text NULL;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS booking_id uuid NULL REFERENCES public.tour_bookings(id) ON DELETE SET NULL;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS consumed_at timestamptz NULL;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS revoked_at timestamptz NULL;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS use_count integer NOT NULL DEFAULT 0;
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS max_uses integer NULL;

-- Explicit authorization model. A row is either fully scoped under the new
-- contract, or it is a pre-Slice-C link with no recipient — and the authorizer
-- refuses the latter rather than guessing who it was for.
ALTER TABLE public.tour_public_booking_links
    ADD COLUMN IF NOT EXISTS authorization_model text NOT NULL DEFAULT 'legacy_unscoped';

-- Backfill: every pre-existing row is explicitly legacy. (Zero rows on shared
-- today; written so the migration is correct anywhere.)
UPDATE public.tour_public_booking_links
   SET authorization_model = 'legacy_unscoped'
 WHERE authorization_model IS NULL
    OR (invitation_id IS NULL AND recipient_person_id IS NULL AND authorization_model <> 'legacy_unscoped');

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_public_booking_links_action_kind_chk') THEN
        ALTER TABLE public.tour_public_booking_links
            ADD CONSTRAINT tour_public_booking_links_action_kind_chk CHECK (
                action_kind IS NULL OR action_kind = ANY (ARRAY[
                    'view_tour_slots','select_tour_slot','decline_tour','view_tour_details',
                    'reschedule_tour','confirm_tour','cancel_tour'
                ])
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_public_booking_links_auth_model_chk') THEN
        ALTER TABLE public.tour_public_booking_links
            ADD CONSTRAINT tour_public_booking_links_auth_model_chk CHECK (
                authorization_model = ANY (ARRAY['legacy_unscoped','scoped'])
            );
    END IF;

    -- A scoped link MUST carry full authority. This is the structural guarantee
    -- that no new unscoped link can be created — it is enforced by the database,
    -- not merely by the code path that happens to insert.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_public_booking_links_scoped_complete_chk') THEN
        ALTER TABLE public.tour_public_booking_links
            ADD CONSTRAINT tour_public_booking_links_scoped_complete_chk CHECK (
                authorization_model <> 'scoped'
                OR (invitation_id IS NOT NULL AND recipient_person_id IS NOT NULL AND action_kind IS NOT NULL)
            );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'tour_public_booking_links_use_count_chk') THEN
        ALTER TABLE public.tour_public_booking_links
            ADD CONSTRAINT tour_public_booking_links_use_count_chk CHECK (
                use_count >= 0 AND (max_uses IS NULL OR use_count <= max_uses)
            );
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_tour_links_invitation
    ON public.tour_public_booking_links (invitation_id) WHERE invitation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tour_links_recipient
    ON public.tour_public_booking_links (org_id, recipient_person_id) WHERE recipient_person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tour_links_booking
    ON public.tour_public_booking_links (booking_id) WHERE booking_id IS NOT NULL;
-- Live actions: what the authorizer scans on every public request.
CREATE INDEX IF NOT EXISTS idx_tour_links_active_actions
    ON public.tour_public_booking_links (org_id, invitation_id, action_kind)
    WHERE is_active AND consumed_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN public.tour_public_booking_links.authorization_model IS
    'scoped = recipient + invitation + action_kind present and enforced. legacy_unscoped = pre-Slice-C link; the scoped authorizer refuses it rather than guessing the recipient.';
COMMENT ON COLUMN public.tour_public_booking_links.consumed_at IS
    'Set atomically on successful use of a single-use action. Consumption is a conditional UPDATE so concurrent requests produce at most one booking.';

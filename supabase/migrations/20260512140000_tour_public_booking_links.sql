-- Card 7: token-scoped public tour booking (server resolves hash; no anon table access).
-- RLS: same org-role helper as tour_bookings / tour_availability_rules (Card 1):
--   public.has_org_role(org_id, text[]) — NOT the non-existent single-uuid overload.
CREATE TABLE IF NOT EXISTS public.tour_public_booking_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    token_hash text NOT NULL,
    token_prefix text NOT NULL,
    opportunity_id uuid NOT NULL REFERENCES public.opportunities (id) ON DELETE CASCADE,
    location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
    expires_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT chk_tour_public_booking_links_metadata_object CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT ux_tour_public_booking_links_token_hash UNIQUE (token_hash)
);

COMMENT ON TABLE public.tour_public_booking_links IS
    'Opaque public tour-booking links (Card 7). Plaintext token shown once at creation; only SHA-256 hash is stored.';

CREATE INDEX IF NOT EXISTS idx_tour_public_booking_links_org_opportunity
    ON public.tour_public_booking_links (org_id, opportunity_id);

CREATE OR REPLACE FUNCTION public.validate_tour_public_booking_link_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    opp_org uuid;
    loc_org uuid;
BEGIN
    SELECT o.org_id INTO opp_org FROM public.opportunities o WHERE o.id = NEW.opportunity_id;
    IF opp_org IS NULL THEN
        RAISE EXCEPTION 'tour_public_booking_links: opportunity_id % not found', NEW.opportunity_id;
    END IF;
    IF opp_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'tour_public_booking_links: opportunity org_id mismatch';
    END IF;

    SELECT l.org_id INTO loc_org FROM public.locations l WHERE l.id = NEW.location_id;
    IF loc_org IS NULL THEN
        RAISE EXCEPTION 'tour_public_booking_links: location_id % not found', NEW.location_id;
    END IF;
    IF loc_org IS DISTINCT FROM NEW.org_id THEN
        RAISE EXCEPTION 'tour_public_booking_links: location org_id mismatch';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tour_public_booking_link_scope ON public.tour_public_booking_links;
CREATE TRIGGER trg_validate_tour_public_booking_link_scope
    BEFORE INSERT OR UPDATE OF org_id, opportunity_id, location_id ON public.tour_public_booking_links
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_tour_public_booking_link_scope();

DROP TRIGGER IF EXISTS trg_tour_public_booking_links_updated_at ON public.tour_public_booking_links;
CREATE TRIGGER trg_tour_public_booking_links_updated_at
    BEFORE UPDATE ON public.tour_public_booking_links
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tour_public_booking_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tour_public_booking_links_select_by_org_role ON public.tour_public_booking_links;
CREATE POLICY tour_public_booking_links_select_by_org_role ON public.tour_public_booking_links FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS tour_public_booking_links_insert_by_org_role ON public.tour_public_booking_links;
CREATE POLICY tour_public_booking_links_insert_by_org_role ON public.tour_public_booking_links FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_public_booking_links_update_by_org_role ON public.tour_public_booking_links;
CREATE POLICY tour_public_booking_links_update_by_org_role ON public.tour_public_booking_links FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text]));

DROP POLICY IF EXISTS tour_public_booking_links_delete_by_org_role ON public.tour_public_booking_links;
CREATE POLICY tour_public_booking_links_delete_by_org_role ON public.tour_public_booking_links FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS tour_public_booking_links_all_service_role ON public.tour_public_booking_links;
CREATE POLICY tour_public_booking_links_all_service_role ON public.tour_public_booking_links FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

REVOKE ALL ON TABLE public.tour_public_booking_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tour_public_booking_links TO authenticated;
GRANT ALL ON TABLE public.tour_public_booking_links TO service_role;

-- =============================================================================
-- Childcare Attendance Facts — Phase 2 (L4 Operational Facts foundation)
-- =============================================================================
-- Immutable, append-only attendance event stream. Records where a child ACTUALLY
-- was during the day, distinct from child_placements (where the child BELONGS).
--
-- Doctrine: docs/platform/modules/attendance-system.md,
--           docs/platform/operational-truth-flow-doctrine.md (L4).
--
-- Hard rules encoded here:
--  - Append-only: a prevent-mutation trigger blocks UPDATE/DELETE for everyone.
--    Corrections/reversals are NEW rows that reference the target via
--    corrects_event_id; the original fact always remains in history.
--  - Room transfer is an attendance FACT (from_room -> to_room); it does NOT
--    supersede child_placements (committed intent).
--  - References the committed enrollment foundation (child_enrollment_agreements,
--    customer_members, locations). NOT the OCM proposal, NOT job-vertical tables.
--  - No "expected attendance" rows here — expectations are derived (L3).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.child_attendance_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    enrollment_agreement_id uuid NOT NULL
        REFERENCES public.child_enrollment_agreements (id) ON DELETE CASCADE,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members (id) ON DELETE RESTRICT,
    site_location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,

    -- what happened
    event_kind text NOT NULL,
    -- original fact vs a later correction/reversal of an earlier fact
    entry_type text NOT NULL DEFAULT 'original',
    corrects_event_id uuid REFERENCES public.child_attendance_events (id) ON DELETE RESTRICT,

    -- when (instant) + which org-local service day it belongs to (for diffing vs L3)
    event_at timestamptz NOT NULL,
    service_date date NOT NULL,

    -- room context (present/check_in/check_out); transfer uses from/to
    room_location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    from_room_location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,
    to_room_location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,

    -- who performed the event
    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    actor_label text,

    -- where the event came from
    source_type text NOT NULL DEFAULT 'operator_action',
    source_key text NOT NULL DEFAULT 'operator_action',

    reason_key text,
    note text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- append-only: created_* only, NO updated_* (rows are never modified)
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT child_attendance_events_event_kind_check
        CHECK (event_kind = ANY (ARRAY[
            'check_in'::text,
            'check_out'::text,
            'absence'::text,
            'present'::text,
            'room_transfer'::text,
            'schedule_override'::text
        ])),
    CONSTRAINT child_attendance_events_entry_type_check
        CHECK (entry_type = ANY (ARRAY['original'::text, 'correction'::text, 'reversal'::text])),
    CONSTRAINT child_attendance_events_actor_type_check
        CHECK (actor_type = ANY (ARRAY[
            'staff'::text, 'parent'::text, 'guardian'::text, 'emergency_contact'::text, 'system'::text
        ])),
    CONSTRAINT child_attendance_events_source_type_check
        CHECK (source_type = ANY (ARRAY[
            'operator_action'::text, 'staff_workspace'::text, 'parent_portal'::text,
            'processing_import'::text, 'system'::text
        ])),
    CONSTRAINT child_attendance_events_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0),
    -- original facts stand alone; corrections/reversals must target a prior event
    CONSTRAINT child_attendance_events_entry_link_shape CHECK (
        (entry_type = 'original' AND corrects_event_id IS NULL)
        OR (entry_type IN ('correction', 'reversal') AND corrects_event_id IS NOT NULL)
    ),
    -- a correction/reversal may not target itself (defense-in-depth; id is server-set)
    CONSTRAINT child_attendance_events_no_self_reference
        CHECK (corrects_event_id IS NULL OR corrects_event_id <> id),
    -- room_transfer requires both endpoints
    CONSTRAINT child_attendance_events_transfer_rooms CHECK (
        event_kind <> 'room_transfer'
        OR (from_room_location_id IS NOT NULL AND to_room_location_id IS NOT NULL)
    ),
    -- check_in / present require a room
    CONSTRAINT child_attendance_events_presence_room CHECK (
        event_kind NOT IN ('check_in', 'present')
        OR room_location_id IS NOT NULL
    )
);

COMMENT ON TABLE public.child_attendance_events IS
    'Immutable, append-only childcare attendance fact stream (L4). Corrections/reversals are new rows referencing corrects_event_id; rows are never updated/deleted. Room transfer is a fact (from->to), distinct from child_placements supersede.';

COMMENT ON COLUMN public.child_attendance_events.service_date IS
    'Org-local calendar service day the event belongs to (for expected-vs-actual diff vs L3).';
COMMENT ON COLUMN public.child_attendance_events.entry_type IS
    'original | correction | reversal. Corrections/reversals supersede a prior fact by reference, never by mutation.';
COMMENT ON COLUMN public.child_attendance_events.corrects_event_id IS
    'Target event a correction/reversal restates or voids. The original remains in history.';

CREATE INDEX IF NOT EXISTS idx_child_attendance_events_org_agreement_date
    ON public.child_attendance_events (org_id, enrollment_agreement_id, service_date);
CREATE INDEX IF NOT EXISTS idx_child_attendance_events_org_site_date
    ON public.child_attendance_events (org_id, site_location_id, service_date);
CREATE INDEX IF NOT EXISTS idx_child_attendance_events_org_member_date
    ON public.child_attendance_events (org_id, customer_member_id, service_date);
CREATE INDEX IF NOT EXISTS idx_child_attendance_events_corrects
    ON public.child_attendance_events (org_id, corrects_event_id)
    WHERE corrects_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Append-only enforcement: block UPDATE and DELETE for ALL roles.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_child_attendance_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'child_attendance_events is append-only: % is not allowed. Record a correction or reversal event instead.', TG_OP
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_child_attendance_events_mutation ON public.child_attendance_events;
CREATE TRIGGER trg_prevent_child_attendance_events_mutation
    BEFORE UPDATE OR DELETE ON public.child_attendance_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_child_attendance_events_mutation();

-- -----------------------------------------------------------------------------
-- Consistency validation against the committed foundation.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_child_attendance_events_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    agr_org uuid;
    agr_member uuid;
    agr_site uuid;
    site_org uuid;
    site_type text;
    r_org uuid;
    r_type text;
    r_parent uuid;
    c_org uuid;
    c_agreement uuid;
BEGIN
    SELECT a.org_id, a.customer_member_id, a.site_location_id
    INTO agr_org, agr_member, agr_site
    FROM public.child_enrollment_agreements a
    WHERE a.id = NEW.enrollment_agreement_id;

    IF agr_org IS NULL THEN
        RAISE EXCEPTION 'child_attendance_events: enrollment_agreement_id % not found', NEW.enrollment_agreement_id
            USING ERRCODE = '23503';
    END IF;
    IF agr_org <> NEW.org_id THEN
        RAISE EXCEPTION 'child_attendance_events: agreement org mismatch' USING ERRCODE = '23514';
    END IF;
    IF agr_member <> NEW.customer_member_id THEN
        RAISE EXCEPTION 'child_attendance_events: customer_member_id does not match agreement' USING ERRCODE = '23514';
    END IF;
    IF NEW.site_location_id <> agr_site THEN
        RAISE EXCEPTION 'child_attendance_events: site_location_id must match agreement site' USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type INTO site_org, site_type
    FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'child_attendance_events: invalid site_location_id %', NEW.site_location_id USING ERRCODE = '23514';
    END IF;

    -- Any referenced room must be a unit under the agreement site.
    IF NEW.room_location_id IS NOT NULL OR NEW.from_room_location_id IS NOT NULL OR NEW.to_room_location_id IS NOT NULL THEN
        FOR r_org, r_type, r_parent IN
            SELECT l.org_id, l.location_type, l.parent_location_id
            FROM public.locations l
            WHERE l.id = ANY (ARRAY[NEW.room_location_id, NEW.from_room_location_id, NEW.to_room_location_id])
        LOOP
            IF r_org IS DISTINCT FROM NEW.org_id OR r_type IS DISTINCT FROM 'unit' THEN
                RAISE EXCEPTION 'child_attendance_events: room must be a unit in the same org' USING ERRCODE = '23514';
            END IF;
            IF r_parent IS DISTINCT FROM NEW.site_location_id THEN
                RAISE EXCEPTION 'child_attendance_events: room must be a child of the agreement site' USING ERRCODE = '23514';
            END IF;
        END LOOP;
    END IF;

    -- Correction/reversal target must be a prior event in the same org + agreement.
    IF NEW.corrects_event_id IS NOT NULL THEN
        SELECT e.org_id, e.enrollment_agreement_id INTO c_org, c_agreement
        FROM public.child_attendance_events e WHERE e.id = NEW.corrects_event_id;
        IF c_org IS NULL THEN
            RAISE EXCEPTION 'child_attendance_events: corrects_event_id % not found', NEW.corrects_event_id USING ERRCODE = '23503';
        END IF;
        IF c_org <> NEW.org_id OR c_agreement <> NEW.enrollment_agreement_id THEN
            RAISE EXCEPTION 'child_attendance_events: correction must target an event on the same org and agreement' USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_child_attendance_events_consistency ON public.child_attendance_events;
CREATE TRIGGER trg_validate_child_attendance_events_consistency
    BEFORE INSERT ON public.child_attendance_events
    FOR EACH ROW EXECUTE FUNCTION public.validate_child_attendance_events_consistency();

-- -----------------------------------------------------------------------------
-- RLS (operational posture — mirrors child_placements; no UPDATE/DELETE grants;
-- immutability is additionally enforced by the trigger above).
-- -----------------------------------------------------------------------------
ALTER TABLE public.child_attendance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_attendance_events_select_org ON public.child_attendance_events;
CREATE POLICY child_attendance_events_select_org
    ON public.child_attendance_events
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_attendance_events.org_id
        )
    );

DROP POLICY IF EXISTS child_attendance_events_insert_crm ON public.child_attendance_events;
CREATE POLICY child_attendance_events_insert_crm
    ON public.child_attendance_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = child_attendance_events.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS child_attendance_events_service_all ON public.child_attendance_events;
CREATE POLICY child_attendance_events_service_all
    ON public.child_attendance_events
    FOR ALL
    TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

GRANT SELECT, INSERT ON TABLE public.child_attendance_events TO authenticated;
GRANT ALL ON TABLE public.child_attendance_events TO service_role;

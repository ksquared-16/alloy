-- Staff presence facts (Staff Presence Phase 4)
-- =============================================================================
-- Where a staff member ACTUALLY was, distinct from `schedule_assignments` (where
-- they are SCHEDULED to be). The exact relationship child attendance has to
-- `child_placements`.
--
-- This is a SECOND conforming fact stream, not a generalization of the first.
-- `child_attendance_events` stays child-grain with its NOT NULL enrollment
-- agreement and customer member; widening it to fit staff would destroy the very
-- constraints that make child attendance trustworthy. See
-- docs/platform/rfcs/operational-expansion-phase1.md §D2/§96.
--
-- Conforms to the Operational Fact contract asserted by
-- web/lib/operationalFacts/factConformance.ts, using `child_attendance_events`
-- as the reference conformer:
--   append-only (UPDATE/DELETE blocked by trigger, for every role)
--   org-scoped with RLS
--   correction/reversal by reference (corrects_event_id), never edit-in-place
--   service_date = org-local effective day; created_at = recorded instant
--   no updated_at — rows are never modified
--
-- NOT payroll. There is no compensable-time, break, overtime or wage concept
-- here and none may be added: this table answers "was this person here", not
-- "what are they owed".
--
-- Rollback: additive. Dropping the table restores the prior schema exactly; no
-- existing table is altered.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff_presence_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,

    -- Subject: the canonical human, plus the employment that made them staff on
    -- this day. Identity is NEVER copied — no name, email or phone lives here.
    person_id uuid NOT NULL REFERENCES public.persons (id) ON DELETE RESTRICT,
    employment_id uuid NOT NULL REFERENCES public.employments (id) ON DELETE RESTRICT,

    site_location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE RESTRICT,

    -- what happened
    event_kind text NOT NULL,
    entry_type text NOT NULL DEFAULT 'original',
    corrects_event_id uuid REFERENCES public.staff_presence_events (id) ON DELETE RESTRICT,

    -- when (instant) + which org-local service day it belongs to
    event_at timestamptz NOT NULL,
    service_date date NOT NULL,

    -- ACTUAL room, which is not the scheduled room. A staff member checks in at
    -- a site and may work in a room; the assignment remains authoritative for
    -- where they were EXPECTED.
    room_location_id uuid REFERENCES public.locations (id) ON DELETE SET NULL,

    actor_type text NOT NULL,
    actor_user_id uuid,
    actor_person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL,
    actor_label text,

    source_type text NOT NULL DEFAULT 'operator_action',
    source_key text NOT NULL DEFAULT 'operator_action',

    reason_key text,
    note text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- append-only: created_* only, NO updated_*
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT staff_presence_events_event_kind_check
        CHECK (event_kind = ANY (ARRAY[
            'check_in'::text,
            'check_out'::text,
            'present'::text,
            'absence'::text
        ])),
    CONSTRAINT staff_presence_events_entry_type_check
        CHECK (entry_type = ANY (ARRAY['original'::text, 'correction'::text, 'reversal'::text])),
    CONSTRAINT staff_presence_events_actor_type_check
        CHECK (actor_type = ANY (ARRAY['staff'::text, 'operator'::text, 'system'::text])),
    CONSTRAINT staff_presence_events_source_type_check
        CHECK (source_type = ANY (ARRAY[
            'operator_action'::text, 'staff_workspace'::text, 'processing_import'::text, 'system'::text
        ])),
    CONSTRAINT staff_presence_events_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0),
    CONSTRAINT staff_presence_events_entry_link_shape CHECK (
        (entry_type = 'original' AND corrects_event_id IS NULL)
        OR (entry_type IN ('correction', 'reversal') AND corrects_event_id IS NOT NULL)
    ),
    CONSTRAINT staff_presence_events_no_self_reference
        CHECK (corrects_event_id IS NULL OR corrects_event_id <> id),
    -- check_in / present assert a place; absence and check_out do not.
    CONSTRAINT staff_presence_events_presence_room CHECK (
        event_kind NOT IN ('check_in', 'present')
        OR room_location_id IS NOT NULL
        OR entry_type = 'reversal'
    )
);

COMMENT ON TABLE public.staff_presence_events IS
    'Immutable, append-only staff presence fact stream. Corrections/reversals are new rows referencing corrects_event_id; rows are never updated or deleted. Distinct from schedule_assignments (scheduled) exactly as child_attendance_events is distinct from child_placements. NOT payroll — no compensable time, breaks or wages.';
COMMENT ON COLUMN public.staff_presence_events.employment_id IS
    'The employment that made this person staff on this service date. Validated against the employment window — presence outside employment is rejected.';
COMMENT ON COLUMN public.staff_presence_events.room_location_id IS
    'ACTUAL room. The scheduled room stays on schedule_assignments; a schedule is never proof of physical presence.';
COMMENT ON COLUMN public.staff_presence_events.entry_type IS
    'original | correction | reversal. Corrections/reversals supersede a prior fact by reference, never by mutation.';

CREATE INDEX IF NOT EXISTS idx_staff_presence_events_org_person_date
    ON public.staff_presence_events (org_id, person_id, service_date);
CREATE INDEX IF NOT EXISTS idx_staff_presence_events_org_site_date
    ON public.staff_presence_events (org_id, site_location_id, service_date);
CREATE INDEX IF NOT EXISTS idx_staff_presence_events_org_room_date
    ON public.staff_presence_events (org_id, room_location_id, service_date)
    WHERE room_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staff_presence_events_corrects
    ON public.staff_presence_events (org_id, corrects_event_id)
    WHERE corrects_event_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Append-only enforcement: block UPDATE and DELETE for ALL roles.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_staff_presence_events_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'staff_presence_events is append-only: % is not allowed. Record a correction or reversal event instead.', TG_OP
        USING ERRCODE = '0A000';
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_staff_presence_events_mutation ON public.staff_presence_events;
CREATE TRIGGER trg_prevent_staff_presence_events_mutation
    BEFORE UPDATE OR DELETE ON public.staff_presence_events
    FOR EACH ROW EXECUTE FUNCTION public.prevent_staff_presence_events_mutation();

-- -----------------------------------------------------------------------------
-- Consistency: employment must cover the service date; scope must be coherent.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_staff_presence_events_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    emp_org uuid;
    emp_person uuid;
    emp_start date;
    emp_end date;
    emp_status text;
    site_org uuid;
    site_type text;
    r_org uuid;
    r_type text;
    r_parent uuid;
    c_org uuid;
    c_person uuid;
BEGIN
    SELECT e.org_id, e.person_id, e.start_date, e.end_date, e.employment_status
      INTO emp_org, emp_person, emp_start, emp_end, emp_status
    FROM public.employments e WHERE e.id = NEW.employment_id;

    IF emp_org IS NULL THEN
        RAISE EXCEPTION 'staff_presence_events: employment_id % not found', NEW.employment_id
            USING ERRCODE = '23503';
    END IF;
    IF emp_org <> NEW.org_id THEN
        RAISE EXCEPTION 'staff_presence_events: employment org mismatch' USING ERRCODE = '23514';
    END IF;
    IF emp_person <> NEW.person_id THEN
        RAISE EXCEPTION 'staff_presence_events: person_id does not match the employment' USING ERRCODE = '23514';
    END IF;

    -- Presence outside the employment window is not a fact about staff.
    IF emp_status = 'canceled'
       OR emp_start > NEW.service_date
       OR (emp_end IS NOT NULL AND emp_end < NEW.service_date) THEN
        RAISE EXCEPTION 'staff_presence_events: employment does not cover service_date %', NEW.service_date
            USING ERRCODE = '23514';
    END IF;

    SELECT l.org_id, l.location_type INTO site_org, site_type
    FROM public.locations l WHERE l.id = NEW.site_location_id;
    IF site_org IS NULL OR site_org <> NEW.org_id OR site_type IS DISTINCT FROM 'site' THEN
        RAISE EXCEPTION 'staff_presence_events: invalid site_location_id %', NEW.site_location_id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.room_location_id IS NOT NULL THEN
        SELECT l.org_id, l.location_type, l.parent_location_id INTO r_org, r_type, r_parent
        FROM public.locations l WHERE l.id = NEW.room_location_id;
        IF r_org IS DISTINCT FROM NEW.org_id OR r_type IS DISTINCT FROM 'unit' THEN
            RAISE EXCEPTION 'staff_presence_events: room must be a unit in the same org' USING ERRCODE = '23514';
        END IF;
        IF r_parent IS DISTINCT FROM NEW.site_location_id THEN
            RAISE EXCEPTION 'staff_presence_events: room must be a child of the presence site' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.corrects_event_id IS NOT NULL THEN
        SELECT e.org_id, e.person_id INTO c_org, c_person
        FROM public.staff_presence_events e WHERE e.id = NEW.corrects_event_id;
        IF c_org IS NULL THEN
            RAISE EXCEPTION 'staff_presence_events: corrects_event_id % not found', NEW.corrects_event_id
                USING ERRCODE = '23503';
        END IF;
        IF c_org <> NEW.org_id OR c_person <> NEW.person_id THEN
            RAISE EXCEPTION 'staff_presence_events: correction must target an event for the same org and person'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_staff_presence_events_consistency ON public.staff_presence_events;
CREATE TRIGGER trg_validate_staff_presence_events_consistency
    BEFORE INSERT ON public.staff_presence_events
    FOR EACH ROW EXECUTE FUNCTION public.validate_staff_presence_events_consistency();

-- -----------------------------------------------------------------------------
-- RLS — mirrors child_attendance_events exactly.
-- -----------------------------------------------------------------------------
ALTER TABLE public.staff_presence_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_presence_events_select_org ON public.staff_presence_events;
CREATE POLICY staff_presence_events_select_org
    ON public.staff_presence_events FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.org_id = staff_presence_events.org_id
        )
    );

DROP POLICY IF EXISTS staff_presence_events_insert_crm ON public.staff_presence_events;
CREATE POLICY staff_presence_events_insert_crm
    ON public.staff_presence_events FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.org_id = staff_presence_events.org_id
              AND ur.role = ANY (ARRAY['owner'::text, 'admin'::text, 'ops'::text])
        )
    );

DROP POLICY IF EXISTS staff_presence_events_service_all ON public.staff_presence_events;
CREATE POLICY staff_presence_events_service_all
    ON public.staff_presence_events FOR ALL TO authenticated
    USING ((auth.role() = 'service_role'::text))
    WITH CHECK ((auth.role() = 'service_role'::text));

GRANT SELECT, INSERT ON TABLE public.staff_presence_events TO authenticated;
GRANT ALL ON TABLE public.staff_presence_events TO service_role;

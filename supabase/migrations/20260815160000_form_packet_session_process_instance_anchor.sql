-- D-95 — the participant Enrollment session realizes an Enrollment process_instance.
--
-- INVESTIGATION RESULT. Alloy has NO generic "runtime artifact realizes this process
-- instance" relationship. Exactly one table in the whole schema carries a
-- `process_instance_id` FK — `tour_invitations`, where the column is explicitly
-- "optional operational context". So there is no framework to reuse and none is invented
-- here: this is a narrow direct FK owned by the packet/session model, matching the one
-- shape the repository already uses.
--
-- WHY IT IS NEEDED. A participant packet session is currently anchored only through
-- `crm_snapshot` -> opportunity/customer. That makes a CRM Opportunity load-bearing for
-- runtime correctness, and it cannot answer the question the Enrollment runtime has to
-- answer: "which Enrollment journey does this participant's work belong to?"
--
-- DIRECTION OF AUTHORITY (D-95). process_instance -> requirements -> participant
-- realization. The session does NOT decide stage, completion policy, transitions or
-- lifecycle state; it supplies satisfaction evidence back to the process. Nothing about
-- lifecycle is copied here — this migration adds a reference and integrity, and no
-- process state column, deliberately, so a second lifecycle authority cannot form.
--
-- NULLABLE. Sessions predate this relationship and packets have legitimate non-Enrollment
-- uses (single-form links, operator-launched packets). NULL means "this session does not
-- realize an Enrollment process instance", which is a real and permanent state, not a
-- migration gap. Historical rows are NOT backfilled: the link cannot be deterministically
-- proven for them, and inventing one would assert an Enrollment journey a parent never had.

ALTER TABLE public.form_packet_sessions
    ADD COLUMN IF NOT EXISTS process_instance_id uuid
        REFERENCES public.process_instances (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.form_packet_sessions.process_instance_id IS
    'D-95. The Enrollment process_instance this participant session realizes. NULL for non-Enrollment packets and for sessions predating the anchor. ON DELETE RESTRICT: a process instance a parent is actively enrolling against may not be deleted out from under their in-flight work — unlike tour_invitations, where the reference is optional context and SET NULL is correct.';

CREATE INDEX IF NOT EXISTS idx_form_packet_sessions_process_instance
    ON public.form_packet_sessions (process_instance_id)
    WHERE process_instance_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Tenant integrity
-- ---------------------------------------------------------------------------
-- A composite FK cannot express this: `process_instances` has no unique key on
-- (id, org_id), and adding one to another platform's table to satisfy this slice would
-- be exactly the "general relationship framework" this slice is told not to build. The
-- repository's established answer for cross-table org integrity is a trigger, so that is
-- what is used — and it holds regardless of which client issues the statement, which
-- TypeScript validation does not.

CREATE OR REPLACE FUNCTION public.validate_form_packet_session_process_instance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_pi_org uuid;
BEGIN
    IF NEW.process_instance_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT pi.org_id INTO v_pi_org
      FROM public.process_instances pi
     WHERE pi.id = NEW.process_instance_id;

    IF v_pi_org IS NULL THEN
        RAISE EXCEPTION 'form_packet_sessions: process_instance_id % not found', NEW.process_instance_id
            USING ERRCODE = '23503';
    END IF;

    IF v_pi_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_packet_sessions: process instance belongs to a different org than this session'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_session_process_instance
    ON public.form_packet_sessions;

CREATE TRIGGER trg_validate_form_packet_session_process_instance
    BEFORE INSERT OR UPDATE OF process_instance_id, org_id
    ON public.form_packet_sessions
    FOR EACH ROW EXECUTE FUNCTION public.validate_form_packet_session_process_instance();

-- ---------------------------------------------------------------------------
-- The anchor is immutable once set
-- ---------------------------------------------------------------------------
-- Repointing a live session to a different Enrollment journey would silently reattribute
-- everything a parent has already answered, uploaded and signed. Clearing it is refused
-- for the same reason: the work would become unattributable while still existing.

CREATE OR REPLACE FUNCTION public.refuse_form_packet_session_process_instance_repoint()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.process_instance_id IS NOT NULL
       AND NEW.process_instance_id IS DISTINCT FROM OLD.process_instance_id THEN
        RAISE EXCEPTION 'form_packet_sessions: process_instance_id is immutable once set (session %)', OLD.id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_form_packet_session_process_instance_repoint
    ON public.form_packet_sessions;

CREATE TRIGGER trg_refuse_form_packet_session_process_instance_repoint
    BEFORE UPDATE ON public.form_packet_sessions
    FOR EACH ROW EXECUTE FUNCTION public.refuse_form_packet_session_process_instance_repoint();

-- ---------------------------------------------------------------------------
-- Cardinality: one CURRENT participant objective per Enrollment journey
-- ---------------------------------------------------------------------------
-- At most one non-terminal session per process instance. `completed` and `cancelled` are
-- terminal, so history accumulates freely and a restarted Enrollment is expressible: cancel
-- the current session, then create the next one.
--
-- This does not conflict with existing packet doctrine. `uq_form_packet_sessions_one_link`
-- already binds a session to one public link, and a Family Packet shares ONE session across
-- recipient links via `packet_instance_id` — so "one current session per journey" is the
-- same grain the packet model already works at, not a new restriction on it.
--
-- Enforced as a partial unique index rather than in application code because the failure it
-- prevents is a race: two launches for the same journey arriving together would otherwise
-- each create a session, and the parent's work would silently split across two.

CREATE UNIQUE INDEX IF NOT EXISTS uq_form_packet_sessions_current_process_instance
    ON public.form_packet_sessions (process_instance_id)
    WHERE process_instance_id IS NOT NULL AND status = 'in_progress';

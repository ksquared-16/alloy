-- D-94 — active participant Form versions are session-pinned.
--
-- PROBLEM. Form version resolution happens at READ time, per step:
-- `resolveActiveStepEnvelope` calls `loadPublishedFormEnvelope(org, form_definition_id, pin)`
-- where `pin` comes from `form_packet_items.pinned_form_definition_version_id`. That pin is a
-- property of the packet DEFINITION, so it has only two settings and neither is right:
--
--   unpinned -> every step resolution takes the latest published version, so republishing a
--               form mid-session changes what a parent sees on their next step, and a partly
--               completed packet no longer matches what they started;
--   pinned   -> stable, but frozen for ALL sessions including future ones, so new enrollments
--               silently stop tracking published updates until somebody re-pins.
--
-- `form_packet_session_items` carries no version at all, so there is nowhere for "the version
-- THIS participant is transacting against" to live.
--
-- DECISION (D-94). Configuration floats; active participant transactions pin. The version is
-- resolved ONCE at session realization and persisted per session item. Republishing affects
-- future sessions only. Business Process requirements keep storing `form_definition_id` alone —
-- no Form version identity is added to the BP requirement, and the packet definition pin keeps
-- its existing meaning.
--
-- This matters beyond rendering: the eventual chain is facts -> populated document -> review ->
-- signature -> durable completed copy, and the exact version a parent signed must be knowable
-- afterwards. A floating reference cannot answer that question.
--
-- ADDITIVE AND NULLABLE-FIRST. No destructive change, no backfill.
--
-- HISTORICAL ROWS. Sessions created before this migration have no provable resolved version.
-- The version they rendered was whatever was latest published at each read, which is not
-- recoverable after the fact — so NULL means "not provable" and the column is deliberately
-- left nullable rather than backfilled with today's latest published version, which would
-- fabricate a claim about what a parent was shown. Readers treat NULL as the pre-D-94
-- compatibility path (resolve as before); new rows are always written with a resolved version,
-- so the nullable window closes going forward without rewriting history.

ALTER TABLE public.form_packet_session_items
    ADD COLUMN IF NOT EXISTS resolved_form_definition_version_id uuid
        REFERENCES public.form_definition_versions (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.form_packet_session_items.resolved_form_definition_version_id IS
    'D-94. The form_definition_version this participant transacts against, resolved once at session realization and never changed. NULL only for sessions created before D-94, where the rendered version is not recoverable and must not be fabricated. ON DELETE RESTRICT: a version an in-flight session is transacting against may not be deleted out from under it.';

CREATE INDEX IF NOT EXISTS idx_form_packet_session_items_resolved_version
    ON public.form_packet_session_items (resolved_form_definition_version_id)
    WHERE resolved_form_definition_version_id IS NOT NULL;

-- Integrity: the resolved version must belong to the SAME form the packet step references, and
-- to the same org. Modelled on the existing `form_packet_items` validation trigger rather than a
-- new pattern. Without this, a resolved version could point at a different form entirely and the
-- session would render something nobody configured — the failure would look like a Forms bug.

CREATE OR REPLACE FUNCTION public.validate_form_packet_session_item_resolved_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_version_form uuid;
    v_version_org  uuid;
    v_item_form    uuid;
BEGIN
    IF NEW.resolved_form_definition_version_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT v.form_definition_id, v.org_id
      INTO v_version_form, v_version_org
      FROM public.form_definition_versions v
     WHERE v.id = NEW.resolved_form_definition_version_id;

    IF v_version_form IS NULL THEN
        RAISE EXCEPTION 'form_packet_session_items: resolved_form_definition_version_id % not found',
            NEW.resolved_form_definition_version_id USING ERRCODE = '23503';
    END IF;

    IF v_version_org <> NEW.org_id THEN
        RAISE EXCEPTION 'form_packet_session_items: resolved version must belong to the same org as the session item'
            USING ERRCODE = '23514';
    END IF;

    SELECT pi.form_definition_id INTO v_item_form
      FROM public.form_packet_items pi
     WHERE pi.id = NEW.packet_item_id;

    IF v_item_form IS NULL THEN
        RAISE EXCEPTION 'form_packet_session_items: packet_item_id % not found', NEW.packet_item_id
            USING ERRCODE = '23503';
    END IF;

    IF v_item_form <> v_version_form THEN
        RAISE EXCEPTION 'form_packet_session_items: resolved version belongs to form %, but this packet step references form %',
            v_version_form, v_item_form USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_form_packet_session_item_resolved_version
    ON public.form_packet_session_items;

CREATE TRIGGER trg_validate_form_packet_session_item_resolved_version
    BEFORE INSERT OR UPDATE OF resolved_form_definition_version_id, packet_item_id
    ON public.form_packet_session_items
    FOR EACH ROW EXECUTE FUNCTION public.validate_form_packet_session_item_resolved_version();

-- Immutability: once resolved, the pin is the transaction's anchor and may not be repointed.
-- Clearing it back to NULL is refused for the same reason — that would silently return an
-- active session to floating behaviour, which is the exact instability D-94 removes.

CREATE OR REPLACE FUNCTION public.refuse_form_packet_session_item_version_repoint()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.resolved_form_definition_version_id IS NOT NULL
       AND NEW.resolved_form_definition_version_id IS DISTINCT FROM OLD.resolved_form_definition_version_id THEN
        RAISE EXCEPTION 'form_packet_session_items: resolved_form_definition_version_id is immutable once set (session % item %)',
            OLD.packet_session_id, OLD.id USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_form_packet_session_item_version_repoint
    ON public.form_packet_session_items;

CREATE TRIGGER trg_refuse_form_packet_session_item_version_repoint
    BEFORE UPDATE ON public.form_packet_session_items
    FOR EACH ROW EXECUTE FUNCTION public.refuse_form_packet_session_item_version_repoint();

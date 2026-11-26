-- D-96 — every RUNNING process instance pins one immutable governing Business Process revision.
--
-- WHY. `process_instances` today resolves its configuration from
-- `departments.metadata.lifecycle_builder_v1` — the LIVE projection, which the next publish
-- replaces wholesale. So a family part-way through Enrollment silently changes which stages,
-- requirements, operating plan and action catalog govern them the instant an operator publishes.
-- Their in-flight work is re-judged against configuration that did not exist when it started.
--
-- The fix is a reference, not a copy. `business_process_revisions` is already immutable
-- (UPDATE/DELETE blocked) and already self-contained as of D-97 — a published revision now carries
-- every stage's `requirements_v1` explicitly, so reading it needs no department metadata. Pinning a
-- running instance to one revision id is therefore sufficient, and copying configuration onto the
-- instance would create a second authority that could drift from the artifact it was copied from.
--
-- REQUIREMENTS-ONLY PINNING IS FORBIDDEN, and this column is why. Pinning only the requirement set
-- while the stage list, operating plan and action catalog kept coming from live metadata would be
-- split-brain: one journey governed by two configurations that no publish keeps in step.
--
-- NULLABLE, AND NOT BACKFILLED. Instances predate this relationship. Which revision governed a
-- journey that started before revisions existed is not derivable — publications carry no per-instance
-- history — so writing a plausible id would be fabricating a governance record. NULL means
-- "unpinned: this journey resolves configuration from the live projection", which is a real and
-- permanent state and is handled by exactly one centralized compatibility branch in
-- `resolveProcessInstanceConfiguration`.

ALTER TABLE public.process_instances
    ADD COLUMN IF NOT EXISTS business_process_revision_id uuid
        REFERENCES public.business_process_revisions (id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.process_instances.business_process_revision_id IS
    'D-96. The immutable Business Process revision governing this running journey. NULL = unpinned (historical instance; resolves from the live lifecycle_builder_v1 projection). ON DELETE RESTRICT: a revision a journey is actively governed by may not be deleted out from under it.';

CREATE INDEX IF NOT EXISTS idx_process_instances_business_process_revision
    ON public.process_instances (business_process_revision_id)
    WHERE business_process_revision_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Tenant + process identity
-- ---------------------------------------------------------------------------
-- A composite FK cannot express either half. `business_process_revisions` has no unique key on
-- (id, org_id), and process identity lives INSIDE the payload rather than in a column. The
-- repository's established answer for cross-table integrity that a FK cannot state is a trigger
-- (see `validate_form_packet_session_process_instance`), and a trigger holds regardless of which
-- client issues the statement — which TypeScript validation does not.
--
-- Process identity matters as much as tenancy: pinning an Enrollment journey to a revision that
-- configures some other process would make every downstream stage lookup silently return nothing,
-- and the instance would look correctly governed while being governed by nothing at all. The
-- builder's process `key` is the same vocabulary as `process_instances.process_key`
-- (ENROLLMENT_TEMPLATE_PROCESS_KEY = ENROLLMENT_PROCESS_KEY = 'enrollment'), so the check is exact
-- rather than heuristic.

CREATE OR REPLACE FUNCTION public.validate_process_instance_business_process_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_rev_org uuid;
    v_payload jsonb;
BEGIN
    IF NEW.business_process_revision_id IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT r.org_id, r.payload
      INTO v_rev_org, v_payload
      FROM public.business_process_revisions r
     WHERE r.id = NEW.business_process_revision_id;

    IF v_rev_org IS NULL THEN
        RAISE EXCEPTION 'process_instances: business_process_revision_id % not found',
            NEW.business_process_revision_id
            USING ERRCODE = '23503';
    END IF;

    IF v_rev_org <> NEW.org_id THEN
        RAISE EXCEPTION 'process_instances: business process revision belongs to a different org than this instance'
            USING ERRCODE = '23514';
    END IF;

    -- Fails CLOSED. A payload with no `processes` array, or one that does not configure this
    -- instance's process, is refused rather than accepted as "probably fine" — an instance pinned
    -- to configuration that cannot govern it is worse than an unpinned one, because it looks
    -- governed.
    IF jsonb_typeof(v_payload -> 'processes') <> 'array'
       OR NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(v_payload -> 'processes') AS p
             WHERE p ->> 'key' = NEW.process_key
       ) THEN
        RAISE EXCEPTION
            'process_instances: business process revision % does not configure process_key %',
            NEW.business_process_revision_id, NEW.process_key
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_validate_process_instance_business_process_revision
    ON public.process_instances;

CREATE TRIGGER trg_validate_process_instance_business_process_revision
    BEFORE INSERT OR UPDATE OF business_process_revision_id, org_id, process_key
    ON public.process_instances
    FOR EACH ROW EXECUTE FUNCTION public.validate_process_instance_business_process_revision();

-- ---------------------------------------------------------------------------
-- The pin is immutable once set
-- ---------------------------------------------------------------------------
-- Repointing a running journey to a different revision is exactly the failure D-96 exists to
-- prevent, arriving by a different door: the family's in-flight work would be re-judged against
-- configuration that did not govern it when the work was done.
--
-- Clearing to NULL is refused for the same reason and is NOT the same thing as a historical NULL.
-- A historical NULL means "this journey never had a governing revision". A cleared NULL would mean
-- "this journey HAD one and we lost it", and it would silently drop the instance onto live
-- configuration — the precise behaviour the pin removes. One state, two irreconcilable meanings, is
-- how an unpinned instance would become indistinguishable from a downgraded one.

CREATE OR REPLACE FUNCTION public.refuse_process_instance_revision_pin_change()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.business_process_revision_id IS NOT NULL
       AND NEW.business_process_revision_id IS DISTINCT FROM OLD.business_process_revision_id THEN
        IF NEW.business_process_revision_id IS NULL THEN
            RAISE EXCEPTION
                'process_instances: business_process_revision_id may not be cleared once set (instance %)',
                OLD.id
                USING ERRCODE = '23514';
        END IF;
        RAISE EXCEPTION
            'process_instances: business_process_revision_id is immutable once set (instance %)',
            OLD.id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refuse_process_instance_revision_pin_change
    ON public.process_instances;

CREATE TRIGGER trg_refuse_process_instance_revision_pin_change
    BEFORE UPDATE ON public.process_instances
    FOR EACH ROW EXECUTE FUNCTION public.refuse_process_instance_revision_pin_change();

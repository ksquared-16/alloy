-- Enrollment lifecycle — `voided`, for a record that never represented service.
--
-- ─── WHY `canceled` WAS NOT WIDENED ───
--
-- `canceled` has one documented meaning: a commitment withdrawn BEFORE service began. It is written
-- only by `cancelAgreementBeforeStart`, which refuses anything that is not `pending_start`. That is
-- a truthful, narrow claim and it is load-bearing — the external visibility law reads it as "never a
-- participant", and the column comment states it.
--
-- An agreement created or activated in error is a different fact. Service never happened, but the
-- record was not "withdrawn before it began" either: it was never real at all. Folding that into
-- `canceled` would make one status mean two things, and the difference is exactly what a later
-- reviewer needs. So the mistake gets its own terminal state rather than an overloaded one.
--
-- The alternative that was rejected: `ended`. Ending asserts that service occurred and concluded,
-- which is the false claim this state exists to avoid — and under the certified visibility law an
-- `ended` agreement keeps the child on the partner roster forever.
--
-- Re-runnable: the constraint is dropped and recreated, and the migration asserts the result.

ALTER TABLE public.child_enrollment_agreements
    DROP CONSTRAINT IF EXISTS child_enrollment_agreements_status_check;

ALTER TABLE public.child_enrollment_agreements
    ADD CONSTRAINT child_enrollment_agreements_status_check
    CHECK (status = ANY (ARRAY[
        'pending_start'::text,
        'active'::text,
        'ending'::text,
        'ended'::text,
        'canceled'::text,
        'voided'::text
    ]));

COMMENT ON COLUMN public.child_enrollment_agreements.status IS
    'pending_start=enrolled not started; active=attending; ending=active with scheduled end; ended=completed/withdrawn; canceled=withdrawn before start; voided=created or activated in error and never represented service.';

-- The partial unique index that keeps one OPERATIONAL agreement per child per site must continue to
-- treat a voided row as gone. It already names only the operational statuses, so `voided` frees the
-- slot exactly as `canceled` does — asserted here rather than assumed, because a void that could not
-- be followed by a corrected enrollment would be useless.
DO $$
DECLARE
    def text;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.child_enrollment_agreements'::regclass
          AND conname = 'child_enrollment_agreements_status_check'
          AND pg_get_constraintdef(oid) LIKE '%voided%'
    ) THEN
        RAISE EXCEPTION 'voided was not admitted by the enrollment status constraint';
    END IF;

    SELECT indexdef INTO def FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'ux_child_enrollment_agreements_one_operational_per_member_site';
    IF def IS NULL THEN
        RAISE EXCEPTION 'the operational uniqueness index is missing';
    END IF;
    IF def LIKE '%voided%' THEN
        RAISE EXCEPTION 'voided must not count as an operational agreement';
    END IF;
END
$$;

-- ─── THE VISIBILITY CONSEQUENCE, IN THE ONE SHARED PREDICATE ───
--
-- A voided enrollment must not publish a child, a household or a relationship — that is the whole
-- point of distinguishing it from `ended`. The law is expressed once and all three readers call it,
-- so this is a single edit rather than three that could drift.
--
-- The law's wording is unchanged in substance: a child is visible when a service commitment exists
-- that was not withdrawn before service began AND was not recorded in error. Both exclusions say
-- the same thing about reality — no service happened — while keeping the reason distinguishable.
CREATE OR REPLACE FUNCTION public.external_child_service_commitment_exists(
    p_org_id uuid,
    p_customer_member_id uuid,
    p_boundary_mode text,
    p_site_ids uuid[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.child_enrollment_agreements ea
        WHERE ea.customer_member_id = p_customer_member_id
          AND ea.org_id = p_org_id
          -- `canceled`: withdrawn before service began. `voided`: recorded in error, never real.
          -- Neither ever represented service, so neither publishes a child.
          AND ea.status NOT IN ('canceled', 'voided')
          AND (p_boundary_mode = 'org_wide'
               OR ea.site_location_id = ANY (COALESCE(p_site_ids, ARRAY[]::uuid[])))
    );
$$;

COMMENT ON FUNCTION public.external_child_service_commitment_exists(uuid, uuid, text, uuid[]) IS
    'The single external visibility law for person-grain public resources: a child is visible when a service commitment exists at a reachable site that neither was withdrawn before service began (canceled) nor was recorded in error (voided). Called by list_external_children, list_external_households and list_external_relationships — never duplicate this predicate.';

DO $$
DECLARE
    def text;
    fn text;
BEGIN
    def := pg_get_functiondef(to_regprocedure('public.external_child_service_commitment_exists(uuid, uuid, text, uuid[])'));
    IF def NOT LIKE '%voided%' THEN
        RAISE EXCEPTION 'the shared visibility law does not exclude voided enrollments';
    END IF;

    FOREACH fn IN ARRAY ARRAY[
        'public.list_external_children(uuid, uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid, uuid[], text)',
        'public.list_external_households(uuid, text, uuid[], integer, timestamptz, uuid, timestamptz, uuid[])',
        'public.list_external_relationships(uuid, text, uuid[], boolean, integer, timestamptz, uuid, timestamptz, uuid, uuid)'
    ]
    LOOP
        IF pg_get_functiondef(to_regprocedure(fn)) NOT LIKE '%external_child_service_commitment_exists%' THEN
            RAISE EXCEPTION '% no longer routes through the shared visibility law', fn;
        END IF;
    END LOOP;
END
$$;

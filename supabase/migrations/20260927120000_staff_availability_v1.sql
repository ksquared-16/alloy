-- =============================================================================
-- Staff & Workforce V2 · Slice 4 — Availability authority
--
-- Two concepts, because they answer the same question on different clocks:
--
--   staff_availability_windows      the recurring weekly pattern   (the rule)
--   staff_availability_exceptions   what differs on one date       (the exception)
--
-- ── WHAT AVAILABILITY IS, AND THE FOUR THINGS IT IS NOT ──
--
-- Availability answers WHEN THIS EMPLOYMENT CAN WORK. It is not the schedule
-- (when the organization decided they WILL work), not an operational assignment
-- (where they participate), not presence (when they actually were here), and not
-- leave. Those authorities exist already and stay separate:
--
--   employments             who works for the organization
--   schedule_assignments    what the organization committed to
--   staff_presence_events   what actually happened
--
-- Nothing here writes to any of them, and nothing here is derived from them. A
-- pattern inferred from past shifts would make the schedule its own justification.
--
-- ── GRAIN: EMPLOYMENT, NOT PERSON ──
--
-- A person can work for two organizations with different availability at each, so
-- Person-global availability would be wrong the first time that happened. Every
-- row carries `employment_id`, and `org_id` is carried beside it so a scoped read
-- never has to join to be safe.
--
-- ── WHY THE SHAPE COPIES childcare_operating_windows ──
--
-- That table already answers "recurring weekday time windows, effective-dated" for
-- the organization's own hours: `weekday` + `open_time`/`close_time`,
-- `effective_start`/`effective_end`, and NO unique on weekday — so several rows on
-- one weekday express a split window. Availability needs exactly those primitives,
-- and inventing a second recurrence model beside it would be two answers to one
-- question. Split availability (07:00-11:00 and 14:00-18:00) therefore costs
-- nothing: it is two rows.
--
-- ── TIME IS LOCAL INTENT ──
--
-- `time` columns are the ORGANISATION's local wall clock, interpreted through the
-- existing timezone contract (`fetchOrgTimeZoneIana`, user_profiles.timezone →
-- org_settings.metadata → UTC). Storing an instant would be wrong: "I can work
-- 07:30-16:30" survives a DST change, and the same absolute times would not.
-- No timezone infrastructure is built here; the platform's is reused.
--
-- ── RLS IS ENABLED IN THIS FILE, NOT A LATER ONE ──
--
-- Slice 3 shipped four tables with RLS disabled while `pg_default_acl` grants
-- `authenticated` SELECT on every new table in `public`. Every staff credential in
-- every organization was readable until it was caught. That is why the policies
-- are here, in the migration that creates the tables, and why the regression lock
-- reads this file.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff_availability_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    employment_id uuid NOT NULL REFERENCES public.employments (id) ON DELETE CASCADE,
    -- 0 = Sunday, matching childcare_operating_windows and tour_availability_rules.
    weekday smallint NOT NULL,
    start_time time NOT NULL,
    end_time time NOT NULL,
    -- Effective dating, so a future pattern is representable without destroying the
    -- current one and past scheduling context stays knowable.
    effective_start date NOT NULL,
    effective_end date,
    is_active boolean NOT NULL DEFAULT true,
    source_key text NOT NULL DEFAULT 'operator',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_availability_windows_weekday_range
        CHECK (weekday >= 0 AND weekday <= 6),
    -- No overnight windows in V1. A window ending before it starts is a data error
    -- far more often than an intent, and accepting it would make every resolver
    -- guess which day the end belongs to.
    CONSTRAINT staff_availability_windows_time_order
        CHECK (end_time > start_time),
    CONSTRAINT staff_availability_windows_effective_order
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT staff_availability_windows_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0)
);

COMMENT ON TABLE public.staff_availability_windows IS
    'Recurring weekly availability for one employment, effective-dated. Several rows on one weekday express a split window. Local wall-clock intent, never an instant.';

CREATE INDEX IF NOT EXISTS staff_availability_windows_employment_idx
    ON public.staff_availability_windows (org_id, employment_id, weekday)
    WHERE is_active;

CREATE INDEX IF NOT EXISTS staff_availability_windows_effective_idx
    ON public.staff_availability_windows (org_id, employment_id, effective_start, effective_end);

CREATE TABLE IF NOT EXISTS public.staff_availability_exceptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    employment_id uuid NOT NULL REFERENCES public.employments (id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    /*
     * TWO KINDS, AND THE DIFFERENCE IS NOT COSMETIC.
     *
     *   unavailable — this date has no availability, whatever the pattern says
     *   available   — this date has EXACTLY these windows, whatever the pattern says
     *
     * Both REPLACE the recurring pattern for that date rather than adding to it.
     * Additive behaviour is the ambiguity this slice is required to avoid: with it,
     * "unavailable Friday" plus a recurring Friday window has no single answer.
     */
    exception_kind text NOT NULL,
    start_time time,
    end_time time,
    reason text,
    is_active boolean NOT NULL DEFAULT true,
    source_key text NOT NULL DEFAULT 'operator',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT staff_availability_exceptions_kind_check
        CHECK (exception_kind = ANY (ARRAY['unavailable'::text, 'available'::text])),
    -- The shape follows the kind, so an "unavailable" row cannot smuggle times and
    -- an "available" row cannot omit them.
    CONSTRAINT staff_availability_exceptions_shape_check
        CHECK (
            (exception_kind = 'unavailable' AND start_time IS NULL AND end_time IS NULL)
            OR (exception_kind = 'available' AND start_time IS NOT NULL AND end_time IS NOT NULL
                AND end_time > start_time)
        ),
    CONSTRAINT staff_availability_exceptions_source_key_nonempty
        CHECK (char_length(btrim(source_key)) > 0)
);

COMMENT ON TABLE public.staff_availability_exceptions IS
    'Dated availability exceptions for one employment. An active exception REPLACES the recurring pattern for that date; it never adds to it.';

CREATE INDEX IF NOT EXISTS staff_availability_exceptions_employment_date_idx
    ON public.staff_availability_exceptions (org_id, employment_id, exception_date)
    WHERE is_active;

-- =============================================================================
-- ROW LEVEL SECURITY — in this file, for the reason stated at the top.
--
-- Posture copied from `employments`, the table availability hangs off: read for
-- owner/admin/ops/manager, write for owner/admin/ops, service_role unrestricted.
-- A boundary weaker than the employment's would be the weaker of the two wherever
-- the two meet.
-- =============================================================================

ALTER TABLE public.staff_availability_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_availability_exceptions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'staff_availability_windows',
        'staff_availability_exceptions'
    ]
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_member_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_operator_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_operator_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_org_operator_delete', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_all', t);

        EXECUTE format($f$
            CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
            USING (has_org_role(org_id, ARRAY['owner','admin','ops','manager']))
        $f$, t || '_org_member_select', t);

        EXECUTE format($f$
            CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
            WITH CHECK (has_org_role(org_id, ARRAY['owner','admin','ops']))
        $f$, t || '_org_operator_insert', t);

        EXECUTE format($f$
            CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
            USING (has_org_role(org_id, ARRAY['owner','admin','ops']))
            WITH CHECK (has_org_role(org_id, ARRAY['owner','admin','ops']))
        $f$, t || '_org_operator_update', t);

        EXECUTE format($f$
            CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
            USING (has_org_role(org_id, ARRAY['owner','admin','ops']))
        $f$, t || '_org_operator_delete', t);

        EXECUTE format($f$
            CREATE POLICY %I ON public.%I FOR ALL TO authenticated
            USING (auth.role() = 'service_role')
            WITH CHECK (auth.role() = 'service_role')
        $f$, t || '_service_all', t);
    END LOOP;
END
$$;

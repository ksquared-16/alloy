-- =============================================================================
-- Program Offerings — Programs domain primitive
-- =============================================================================
-- Ownership: Programs domain. Consumed by Commercial, Enrollment, Scheduling,
-- Capacity, Attendance, Analytics, AI. Commercial never owns what is being sold.
--
-- Each row is one purchasable program configuration (e.g. Full Time 5 Days,
-- Part Time 3 Days) scoped to an org × program_key pair.
--
-- V1: one flat table. Designed to separate into Offering Type + Offering
-- Configuration in a future migration if operators need variant pricing
-- (e.g. Mon/Wed/Fri vs Tue/Thu for "3-day part-time").
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.program_offerings (
    id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id           uuid        NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    program_key      text        NOT NULL,
    label            text        NOT NULL,
    -- Attendance type enum (enforced in application layer, not DB CHECK for flexibility)
    -- Values: full_time | part_time | drop_in | hourly | before_school | after_school | custom
    attendance_type  text        NOT NULL,
    -- Quantity type: days | hours | sessions | weeks | months | null (for open-ended types)
    quantity_type    text,
    -- Quantity value: e.g. 5 for "5 days", 3 for "3 days", null for drop_in
    quantity_value   numeric,
    -- Operator-visible status lifecycle
    -- Values: active | draft | coming_soon | seasonal | retired | archived
    status           text        NOT NULL DEFAULT 'active',
    -- Operational date bounds (not commercial/billing dates)
    effective_start  date,
    effective_end    date,
    sort_order       integer     NOT NULL DEFAULT 100,
    is_active        boolean     NOT NULL DEFAULT true,
    metadata         jsonb       NOT NULL DEFAULT '{}',
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz,
    -- One offering per (org, program, attendance_type, quantity combination)
    -- NULLS NOT DISTINCT so (org, program, drop_in, null, null) is a valid unique row
    CONSTRAINT program_offerings_unique
        UNIQUE NULLS NOT DISTINCT (org_id, program_key, attendance_type, quantity_type, quantity_value)
);

COMMENT ON TABLE public.program_offerings IS
    'Programs domain primitive: one purchasable offering per program×attendance configuration. '
    'Consumed by Commercial (rates), Enrollment, Scheduling, Capacity, Attendance, Analytics, AI.';

COMMENT ON COLUMN public.program_offerings.attendance_type IS
    'Operational attendance pattern: full_time | part_time | drop_in | hourly | before_school | after_school | custom';

COMMENT ON COLUMN public.program_offerings.quantity_type IS
    'Unit of measure for quantity_value: days | hours | sessions | weeks | months | null';

COMMENT ON COLUMN public.program_offerings.quantity_value IS
    'Number of units per week/period (e.g. 5 for 5 days, 3 for 3 days). Null for open-ended types.';

COMMENT ON COLUMN public.program_offerings.status IS
    'Operator lifecycle: active | draft | coming_soon | seasonal | retired | archived';

CREATE INDEX IF NOT EXISTS idx_program_offerings_org
    ON public.program_offerings (org_id);

CREATE INDEX IF NOT EXISTS idx_program_offerings_org_program
    ON public.program_offerings (org_id, program_key);

CREATE INDEX IF NOT EXISTS idx_program_offerings_org_active
    ON public.program_offerings (org_id, is_active)
    WHERE is_active = true;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.set_program_offerings_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS program_offerings_updated_at ON public.program_offerings;
CREATE TRIGGER program_offerings_updated_at
    BEFORE UPDATE ON public.program_offerings
    FOR EACH ROW EXECUTE FUNCTION public.set_program_offerings_updated_at();

-- RLS
ALTER TABLE public.program_offerings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS program_offerings_select_org ON public.program_offerings;
CREATE POLICY program_offerings_select_org ON public.program_offerings
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS program_offerings_insert_org ON public.program_offerings;
CREATE POLICY program_offerings_insert_org ON public.program_offerings
    FOR INSERT TO authenticated
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS program_offerings_update_org ON public.program_offerings;
CREATE POLICY program_offerings_update_org ON public.program_offerings
    FOR UPDATE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS program_offerings_delete_org ON public.program_offerings;
CREATE POLICY program_offerings_delete_org ON public.program_offerings
    FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin']));

DROP POLICY IF EXISTS program_offerings_all_service_role ON public.program_offerings;
CREATE POLICY program_offerings_all_service_role ON public.program_offerings
    FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.program_offerings TO authenticated;
GRANT ALL ON TABLE public.program_offerings TO service_role;

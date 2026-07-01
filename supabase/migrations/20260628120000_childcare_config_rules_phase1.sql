-- =============================================================================
-- Childcare operational config rules — Phase 1 (first-class L1 configuration)
-- =============================================================================
-- Moves capacity / ratio / schedule operating rules out of EAV (field_values)
-- into first-class, effective-dated, scoped configuration truth.
--
-- Doctrine: docs/platform/operational-truth-flow-doctrine.md (L1 Configuration;
-- config-as-first-class), docs/sprints/06_2026/operational_execution_config_rule_grain_decision_memo.md
--
-- Shared scope model (most-specific-wins): org default -> site -> program -> room.
-- Exactly one scope id is set per non-org scope. A shared dimension (age_group_key)
-- may narrow a rule further. Resolution precedence is owned by the TS resolver
-- (web/lib/childcareOperational/config/resolveConfigRule.ts).
--
-- NOT system-of-record for expectations: expected attendance / occupancy / ratio
-- are derived at read time (no materialized expectation tables here).
-- NOT job vertical: this migration deliberately references none of the
-- off-limits job-anchored or legacy scheduling/pricing tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared scope validation (reused by all scoped config rule tables; these tables
-- share the scope column names scope_type / site_location_id /
-- program_category_id / room_location_id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_childcare_config_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    site_org uuid;
    site_type text;
    prog_org uuid;
    room_org uuid;
    room_type text;
    room_parent uuid;
BEGIN
    IF NEW.site_location_id IS NOT NULL THEN
        SELECT l.org_id, l.location_type INTO site_org, site_type
        FROM public.locations l WHERE l.id = NEW.site_location_id;
        IF site_org IS NULL THEN
            RAISE EXCEPTION 'childcare config scope: site_location_id % not found', NEW.site_location_id
                USING ERRCODE = '23503';
        END IF;
        IF site_org <> NEW.org_id THEN
            RAISE EXCEPTION 'childcare config scope: site org mismatch' USING ERRCODE = '23514';
        END IF;
        IF site_type IS DISTINCT FROM 'site' THEN
            RAISE EXCEPTION 'childcare config scope: site_location_id % must be location_type site (got %)',
                NEW.site_location_id, site_type USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.program_category_id IS NOT NULL THEN
        SELECT lpc.org_id INTO prog_org
        FROM public.location_program_categories lpc WHERE lpc.id = NEW.program_category_id;
        IF prog_org IS NULL THEN
            RAISE EXCEPTION 'childcare config scope: program_category_id % not found', NEW.program_category_id
                USING ERRCODE = '23503';
        END IF;
        IF prog_org <> NEW.org_id THEN
            RAISE EXCEPTION 'childcare config scope: program category org mismatch' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.room_location_id IS NOT NULL THEN
        SELECT l.org_id, l.location_type, l.parent_location_id
        INTO room_org, room_type, room_parent
        FROM public.locations l WHERE l.id = NEW.room_location_id;
        IF room_org IS NULL THEN
            RAISE EXCEPTION 'childcare config scope: room_location_id % not found', NEW.room_location_id
                USING ERRCODE = '23503';
        END IF;
        IF room_org <> NEW.org_id THEN
            RAISE EXCEPTION 'childcare config scope: room org mismatch' USING ERRCODE = '23514';
        END IF;
        IF room_type IS DISTINCT FROM 'unit' THEN
            RAISE EXCEPTION 'childcare config scope: room_location_id % must be location_type unit (got %)',
                NEW.room_location_id, room_type USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

-- =============================================================================
-- 1) childcare_capacity_rules — physical / licensed / operational seat limits
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.childcare_capacity_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    site_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_category_id uuid REFERENCES public.location_program_categories (id) ON DELETE CASCADE,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    age_group_key text,
    capacity_kind text NOT NULL,
    capacity integer NOT NULL,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_capacity_rules_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])),
    CONSTRAINT childcare_capacity_rules_capacity_kind_check
        CHECK (capacity_kind = ANY (ARRAY['physical'::text, 'licensed'::text, 'operational'::text])),
    CONSTRAINT childcare_capacity_rules_capacity_nonneg CHECK (capacity >= 0),
    CONSTRAINT childcare_capacity_rules_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT childcare_capacity_rules_scope_shape CHECK (
        (scope_type = 'org' AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'site' AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'program' AND program_category_id IS NOT NULL AND site_location_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'room' AND room_location_id IS NOT NULL AND site_location_id IS NULL AND program_category_id IS NULL)
    )
);

COMMENT ON TABLE public.childcare_capacity_rules IS
    'First-class seat-limit config (physical/licensed/operational), scoped org->site->program->room, effective-dated. Retires location license_capacity EAV. Ratio-limited and staffed capacity are derived, not stored.';

CREATE INDEX IF NOT EXISTS idx_childcare_capacity_rules_org_scope
    ON public.childcare_capacity_rules (org_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_childcare_capacity_rules_org_site
    ON public.childcare_capacity_rules (org_id, site_location_id) WHERE site_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_childcare_capacity_rules_org_room
    ON public.childcare_capacity_rules (org_id, room_location_id) WHERE room_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_childcare_capacity_rules_org_program
    ON public.childcare_capacity_rules (org_id, program_category_id) WHERE program_category_id IS NOT NULL;

-- =============================================================================
-- 2) childcare_ratio_rules (+ tiers) — first-class compliance ratio config
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.childcare_ratio_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    site_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_category_id uuid REFERENCES public.location_program_categories (id) ON DELETE CASCADE,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    age_group_key text,
    jurisdiction_key text,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_ratio_rules_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])),
    CONSTRAINT childcare_ratio_rules_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT childcare_ratio_rules_scope_shape CHECK (
        (scope_type = 'org' AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'site' AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'program' AND program_category_id IS NOT NULL AND site_location_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'room' AND room_location_id IS NOT NULL AND site_location_id IS NULL AND program_category_id IS NULL)
    )
);

COMMENT ON TABLE public.childcare_ratio_rules IS
    'First-class staff:child ratio compliance config, keyed by age group (+ optional jurisdiction), scoped org->site->program->room, effective-dated. Tiered thresholds live in childcare_ratio_rule_tiers.';

CREATE INDEX IF NOT EXISTS idx_childcare_ratio_rules_org_scope
    ON public.childcare_ratio_rules (org_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_childcare_ratio_rules_org_age_group
    ON public.childcare_ratio_rules (org_id, age_group_key) WHERE age_group_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.childcare_ratio_rule_tiers (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    ratio_rule_id uuid NOT NULL REFERENCES public.childcare_ratio_rules (id) ON DELETE CASCADE,
    max_children integer NOT NULL,
    required_staff integer NOT NULL,
    sort_order integer NOT NULL DEFAULT 100,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_ratio_rule_tiers_max_children_positive CHECK (max_children > 0),
    CONSTRAINT childcare_ratio_rule_tiers_required_staff_positive CHECK (required_staff > 0),
    CONSTRAINT childcare_ratio_rule_tiers_unique_threshold UNIQUE (ratio_rule_id, max_children)
);

COMMENT ON TABLE public.childcare_ratio_rule_tiers IS
    'Tiered staffing thresholds for a ratio rule (e.g. 1 staff up to 5, 2 staff up to 11, 3 staff up to 16). ratio-limited capacity = max(max_children).';

CREATE INDEX IF NOT EXISTS idx_childcare_ratio_rule_tiers_rule
    ON public.childcare_ratio_rule_tiers (ratio_rule_id, max_children);

-- =============================================================================
-- 3) childcare_operating_windows — per-weekday operating day/time windows
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.childcare_operating_windows (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    site_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_category_id uuid REFERENCES public.location_program_categories (id) ON DELETE CASCADE,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    weekday smallint NOT NULL,
    open_time time NOT NULL,
    close_time time NOT NULL,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_operating_windows_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])),
    CONSTRAINT childcare_operating_windows_weekday_range CHECK (weekday >= 0 AND weekday <= 6),
    CONSTRAINT childcare_operating_windows_time_order CHECK (close_time > open_time),
    CONSTRAINT childcare_operating_windows_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT childcare_operating_windows_scope_shape CHECK (
        (scope_type = 'org' AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'site' AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'program' AND program_category_id IS NOT NULL AND site_location_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'room' AND room_location_id IS NOT NULL AND site_location_id IS NULL AND program_category_id IS NULL)
    )
);

COMMENT ON TABLE public.childcare_operating_windows IS
    'Operating day/time windows (weekday 0-6, Sunday=0) scoped org->site->program->room, effective-dated. Bounds expected service days; date-specific closures are a future companion concern.';

CREATE INDEX IF NOT EXISTS idx_childcare_operating_windows_org_scope
    ON public.childcare_operating_windows (org_id, scope_type);
CREATE INDEX IF NOT EXISTS idx_childcare_operating_windows_org_site_weekday
    ON public.childcare_operating_windows (org_id, site_location_id, weekday) WHERE site_location_id IS NOT NULL;

-- =============================================================================
-- 4) childcare_schedule_rules — eligibility + policy (NOT the schedule catalog)
-- =============================================================================
-- schedule_patterns remain the child schedule intent/catalog (L2). These rules
-- are L1 operating policy: which schedule types / age bands are eligible and
-- min/max days policy per scope.
CREATE TABLE IF NOT EXISTS public.childcare_schedule_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    scope_type text NOT NULL,
    site_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    program_category_id uuid REFERENCES public.location_program_categories (id) ON DELETE CASCADE,
    room_location_id uuid REFERENCES public.locations (id) ON DELETE CASCADE,
    age_group_key text,
    eligible_schedule_type_keys text[],
    eligible_age_group_keys text[],
    min_days_per_week smallint,
    max_days_per_week smallint,
    effective_start date NOT NULL,
    effective_end date,
    source_key text NOT NULL DEFAULT 'config',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid,
    updated_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT childcare_schedule_rules_scope_type_check
        CHECK (scope_type = ANY (ARRAY['org'::text, 'site'::text, 'program'::text, 'room'::text])),
    CONSTRAINT childcare_schedule_rules_days_range CHECK (
        (min_days_per_week IS NULL OR (min_days_per_week >= 0 AND min_days_per_week <= 7))
        AND (max_days_per_week IS NULL OR (max_days_per_week >= 0 AND max_days_per_week <= 7))
        AND (min_days_per_week IS NULL OR max_days_per_week IS NULL OR max_days_per_week >= min_days_per_week)
    ),
    CONSTRAINT childcare_schedule_rules_end_after_start
        CHECK (effective_end IS NULL OR effective_end >= effective_start),
    CONSTRAINT childcare_schedule_rules_scope_shape CHECK (
        (scope_type = 'org' AND site_location_id IS NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'site' AND site_location_id IS NOT NULL AND program_category_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'program' AND program_category_id IS NOT NULL AND site_location_id IS NULL AND room_location_id IS NULL)
        OR (scope_type = 'room' AND room_location_id IS NOT NULL AND site_location_id IS NULL AND program_category_id IS NULL)
    )
);

COMMENT ON TABLE public.childcare_schedule_rules IS
    'Operating constraints/eligibility/policy over schedule_patterns (L1). Distinct from schedule_patterns (child schedule intent/catalog). Defines eligible schedule types / age bands and min/max days per scope.';

CREATE INDEX IF NOT EXISTS idx_childcare_schedule_rules_org_scope
    ON public.childcare_schedule_rules (org_id, scope_type);

-- -----------------------------------------------------------------------------
-- 5) Triggers: shared scope validation + weekday + updated_at
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_childcare_capacity_rules_scope ON public.childcare_capacity_rules;
CREATE TRIGGER trg_validate_childcare_capacity_rules_scope
    BEFORE INSERT OR UPDATE ON public.childcare_capacity_rules
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_config_scope();

DROP TRIGGER IF EXISTS trg_validate_childcare_ratio_rules_scope ON public.childcare_ratio_rules;
CREATE TRIGGER trg_validate_childcare_ratio_rules_scope
    BEFORE INSERT OR UPDATE ON public.childcare_ratio_rules
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_config_scope();

DROP TRIGGER IF EXISTS trg_validate_childcare_operating_windows_scope ON public.childcare_operating_windows;
CREATE TRIGGER trg_validate_childcare_operating_windows_scope
    BEFORE INSERT OR UPDATE ON public.childcare_operating_windows
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_config_scope();

DROP TRIGGER IF EXISTS trg_validate_childcare_schedule_rules_scope ON public.childcare_schedule_rules;
CREATE TRIGGER trg_validate_childcare_schedule_rules_scope
    BEFORE INSERT OR UPDATE ON public.childcare_schedule_rules
    FOR EACH ROW EXECUTE FUNCTION public.validate_childcare_config_scope();

DROP TRIGGER IF EXISTS trg_childcare_capacity_rules_updated_at ON public.childcare_capacity_rules;
CREATE TRIGGER trg_childcare_capacity_rules_updated_at
    BEFORE UPDATE ON public.childcare_capacity_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_childcare_ratio_rules_updated_at ON public.childcare_ratio_rules;
CREATE TRIGGER trg_childcare_ratio_rules_updated_at
    BEFORE UPDATE ON public.childcare_ratio_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_childcare_ratio_rule_tiers_updated_at ON public.childcare_ratio_rule_tiers;
CREATE TRIGGER trg_childcare_ratio_rule_tiers_updated_at
    BEFORE UPDATE ON public.childcare_ratio_rule_tiers
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_childcare_operating_windows_updated_at ON public.childcare_operating_windows;
CREATE TRIGGER trg_childcare_operating_windows_updated_at
    BEFORE UPDATE ON public.childcare_operating_windows
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_childcare_schedule_rules_updated_at ON public.childcare_schedule_rules;
CREATE TRIGGER trg_childcare_schedule_rules_updated_at
    BEFORE UPDATE ON public.childcare_schedule_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 6) RLS (config posture — mirrors schedule_patterns / location_program_categories)
-- -----------------------------------------------------------------------------
ALTER TABLE public.childcare_capacity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.childcare_ratio_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.childcare_ratio_rule_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.childcare_operating_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.childcare_schedule_rules ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    tbl text;
    rule_tables text[] := ARRAY[
        'childcare_capacity_rules',
        'childcare_ratio_rules',
        'childcare_ratio_rule_tiers',
        'childcare_operating_windows',
        'childcare_schedule_rules'
    ];
BEGIN
    FOREACH tbl IN ARRAY rule_tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I_select_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_select_org ON public.%I FOR SELECT TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text, ''manager''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_insert_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_insert_org ON public.%I FOR INSERT TO authenticated '
            || 'WITH CHECK (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_update_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_update_org ON public.%I FOR UPDATE TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text])) '
            || 'WITH CHECK (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text, ''ops''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_delete_org ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_delete_org ON public.%I FOR DELETE TO authenticated '
            || 'USING (public.has_org_role(org_id, ARRAY[''owner''::text, ''admin''::text]));',
            tbl, tbl
        );

        EXECUTE format('DROP POLICY IF EXISTS %I_all_service_role ON public.%I;', tbl, tbl);
        EXECUTE format(
            'CREATE POLICY %I_all_service_role ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
            tbl, tbl
        );

        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated;', tbl);
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', tbl);
    END LOOP;
END $$;

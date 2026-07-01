-- Resolver hot path: surface + org scope + active placements
CREATE INDEX IF NOT EXISTS idx_action_placements_surface_org_active
    ON public.action_placements (surface, org_id, is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_action_placements_work_unit_surface_active
    ON public.action_placements (work_unit_id, surface, is_active)
    WHERE is_active = true AND work_unit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_definitions_key_active_global
    ON public.action_definitions (key, is_active)
    WHERE is_active = true AND org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_action_definitions_org_key_active
    ON public.action_definitions (org_id, key, is_active)
    WHERE is_active = true AND org_id IS NOT NULL;

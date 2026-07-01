-- Record chrome: layout + action config (global templates). Consumed by admin UI above RRS — not part of record resolution.

CREATE TABLE IF NOT EXISTS public.record_layouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    entity_type text NOT NULL,
    key text NOT NULL,
    config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.record_layouts IS
  'Per-entity record UI layout (sections order, hints). Application resolves against presentation + RRS data — not RRS-owned.';

COMMENT ON COLUMN public.record_layouts.entity_type IS
  'Logical entity: job, schedule (matches admin record chrome, not DB table names).';

COMMENT ON COLUMN public.record_layouts.config_json IS
  'JSON: e.g. { "version": 1, "overview_section_order": ["overview", ...] }.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_record_layouts_entity_key ON public.record_layouts (entity_type, key);

CREATE INDEX IF NOT EXISTS idx_record_layouts_entity_active ON public.record_layouts (entity_type) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.record_actions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    entity_type text NOT NULL,
    action_key text NOT NULL,
    label text NOT NULL,
    event_key text NOT NULL,
    placement text NOT NULL DEFAULT 'secondary',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT record_actions_placement_check CHECK (placement = ANY (ARRAY['primary'::text, 'secondary'::text]))
);

COMMENT ON TABLE public.record_actions IS
  'Configurable record action buttons; UI maps event_key to handlers — not RRS-owned.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_record_actions_entity_action ON public.record_actions (entity_type, action_key);

CREATE INDEX IF NOT EXISTS idx_record_actions_entity_active ON public.record_actions (entity_type) WHERE is_active = true;

ALTER TABLE public.record_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "record_layouts_select_authenticated" ON public.record_layouts;
CREATE POLICY "record_layouts_select_authenticated" ON public.record_layouts FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "record_layouts_all_service_role" ON public.record_layouts;
CREATE POLICY "record_layouts_all_service_role" ON public.record_layouts FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "record_actions_select_authenticated" ON public.record_actions;
CREATE POLICY "record_actions_select_authenticated" ON public.record_actions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "record_actions_all_service_role" ON public.record_actions;
CREATE POLICY "record_actions_all_service_role" ON public.record_actions FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.record_layouts TO authenticated;
GRANT SELECT ON TABLE public.record_actions TO authenticated;
GRANT ALL ON TABLE public.record_layouts TO service_role;
GRANT ALL ON TABLE public.record_actions TO service_role;

-- Seed: job layout (JobRecordModalV2 section keys) + schedule layout (entityPresentation schedules overview)
INSERT INTO public.record_layouts (entity_type, key, config_json, is_active)
VALUES
    (
        'job',
        'default',
        $json$
{
  "version": 1,
  "overview_section_order": [
    "property_service_v2",
    "scheduling_v2",
    "job_pricing_breakdown",
    "pricing",
    "people_places_v2",
    "internal_notes_record_v2"
  ]
}
$json$::jsonb,
        true
    ),
    (
        'schedule',
        'default',
        $json$
{
  "version": 1,
  "overview_section_order": [
    "overview",
    "property_service",
    "job",
    "customer",
    "location",
    "vendor",
    "reschedule_history",
    "documents"
  ]
}
$json$::jsonb,
        true
    )
ON CONFLICT (entity_type, key) DO UPDATE SET
    config_json = EXCLUDED.config_json,
    is_active = EXCLUDED.is_active;

INSERT INTO public.record_actions (entity_type, action_key, label, event_key, placement, is_active)
VALUES
    ('job', 'collect_payment', 'Make payment', 'collect_payment', 'primary', true),
    ('job', 'assign_vendor', 'Assign vendor', 'assign_vendor', 'secondary', true),
    ('schedule', 'reschedule', 'Reschedule', 'reschedule', 'primary', true),
    ('schedule', 'cancel_visit', 'Cancel visit', 'cancel_schedule', 'secondary', true)
ON CONFLICT (entity_type, action_key) DO UPDATE SET
    label = EXCLUDED.label,
    event_key = EXCLUDED.event_key,
    placement = EXCLUDED.placement,
    is_active = EXCLUDED.is_active;

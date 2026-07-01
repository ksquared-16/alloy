-- Minimal normalized action layer (v1): definitions + placements for config-driven UI actions.
-- Admin APIs use service role; RLS allows org-scoped + global template reads for future direct client use.

CREATE TABLE IF NOT EXISTS public.action_definitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    description text,
    entity_type text,
    action_type text NOT NULL,
    icon text,
    style text,
    priority integer NOT NULL DEFAULT 100,
    required_permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
    condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    workflow_id uuid REFERENCES public.workflows (id) ON DELETE SET NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT action_definitions_action_type_check CHECK (
        action_type = ANY (
            ARRAY[
                'navigate'::text,
                'open_drawer'::text,
                'update_status'::text,
                'update_field'::text,
                'start_workflow'::text,
                'external_link'::text,
                'ui_intent'::text
            ]
        )
    )
);

COMMENT ON TABLE public.action_definitions IS
  'Org-scoped or global (org_id null) UI action definitions; executed via admin action executor.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_action_definitions_org_key
    ON public.action_definitions (org_id, key)
    WHERE org_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_action_definitions_global_key
    ON public.action_definitions (key)
    WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_action_definitions_entity_active
    ON public.action_definitions (entity_type)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_action_definitions_org_active
    ON public.action_definitions (org_id)
    WHERE is_active = true AND org_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS public.action_placements (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    org_id uuid REFERENCES public.orgs (id) ON DELETE CASCADE,
    action_definition_id uuid NOT NULL REFERENCES public.action_definitions (id) ON DELETE CASCADE,
    surface text NOT NULL,
    slot text NOT NULL,
    entity_type text,
    department_id uuid REFERENCES public.departments (id) ON DELETE CASCADE,
    work_unit_id uuid REFERENCES public.work_units (id) ON DELETE CASCADE,
    order_index integer NOT NULL DEFAULT 100,
    display_style text NOT NULL DEFAULT 'button',
    condition_config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT action_placements_surface_check CHECK (
        surface = ANY (
            ARRAY[
                'record_header'::text,
                'record_section'::text,
                'queue_row'::text,
                'work_unit'::text,
                'department'::text,
                'workspace'::text,
                'right_rail'::text
            ]
        )
    ),
    CONSTRAINT action_placements_slot_check CHECK (
        slot = ANY (
            ARRAY[
                'primary'::text,
                'secondary'::text,
                'overflow'::text,
                'right_rail'::text,
                'row_inline'::text,
                'header'::text
            ]
        )
    ),
    CONSTRAINT action_placements_display_style_check CHECK (
        display_style = ANY (
            ARRAY['button'::text, 'icon_button'::text, 'link'::text, 'menu_item'::text]
        )
    )
);

COMMENT ON TABLE public.action_placements IS
  'Where a definition appears (surface + slot); nullable department_id/work_unit_id scope placement.';

CREATE INDEX IF NOT EXISTS idx_action_placements_surface_active
    ON public.action_placements (surface, is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_action_placements_def
    ON public.action_placements (action_definition_id);

CREATE INDEX IF NOT EXISTS idx_action_placements_org
    ON public.action_placements (org_id)
    WHERE org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_action_placements_work_unit
    ON public.action_placements (work_unit_id)
    WHERE work_unit_id IS NOT NULL;


DROP TRIGGER IF EXISTS set_action_definitions_updated_at ON public.action_definitions;
CREATE TRIGGER set_action_definitions_updated_at
    BEFORE UPDATE ON public.action_definitions
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_action_placements_updated_at ON public.action_placements;
CREATE TRIGGER set_action_placements_updated_at
    BEFORE UPDATE ON public.action_placements
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();


ALTER TABLE public.action_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_placements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS action_definitions_select_authenticated ON public.action_definitions;
CREATE POLICY action_definitions_select_authenticated ON public.action_definitions
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR org_id = public.current_org_id());

DROP POLICY IF EXISTS action_definitions_all_service_role ON public.action_definitions;
CREATE POLICY action_definitions_all_service_role ON public.action_definitions
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS action_placements_select_authenticated ON public.action_placements;
CREATE POLICY action_placements_select_authenticated ON public.action_placements
    FOR SELECT TO authenticated
    USING (org_id IS NULL OR org_id = public.current_org_id());

DROP POLICY IF EXISTS action_placements_all_service_role ON public.action_placements;
CREATE POLICY action_placements_all_service_role ON public.action_placements
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE public.action_definitions TO authenticated;
GRANT SELECT ON TABLE public.action_placements TO authenticated;
GRANT ALL ON TABLE public.action_definitions TO service_role;
GRANT ALL ON TABLE public.action_placements TO service_role;


-- ---------------------------------------------------------------------------
-- Global seed definitions (org_id NULL) — Enrollment / Opportunity slice
-- payload_schema v1: default payload / hints for resolver + executor
-- ---------------------------------------------------------------------------

INSERT INTO public.action_definitions (org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
SELECT v.org_id, v.key, v.label, v.description, v.entity_type, v.action_type, v.priority, v.payload_schema::jsonb, v.is_active
FROM (VALUES
    (NULL::uuid, 'open_record', 'Open', 'Open inquiry in drawer', 'opportunity', 'open_drawer', 10,
     '{"drawer":{"entityType":"opportunities","idFrom":"entity_id"}}', true),
    (NULL::uuid, 'qualify_opportunity', 'Qualify', 'Mark as contacted', 'opportunity', 'update_status', 20,
     '{"status_key":"contacted"}', true),
    (NULL::uuid, 'start_quote', 'Start quote', 'Open quote intake', 'opportunity', 'open_drawer', 30,
     '{"drawer":{"entityType":"opportunities","idFrom":"entity_id","defaultSurface":"quote_intake"}}', true),
    (NULL::uuid, 'mark_won', 'Enrolled', 'Mark enrolled', 'opportunity', 'update_status', 40,
     '{"status_key":"enrolled"}', true),
    (NULL::uuid, 'mark_lost', 'Lost', 'Mark lost', 'opportunity', 'update_status', 50,
     '{"status_key":"lost","lost_reason":"Marked lost (action)"}', true),
    (NULL::uuid, 'schedule_tour', 'Schedule tour', 'Set tour scheduled status', 'opportunity', 'update_status', 55,
     '{"status_key":"tour_scheduled"}', true),
    (NULL::uuid, 'send_message_placeholder', 'Message', 'Placeholder — no send yet', 'opportunity', 'ui_intent', 200,
     '{"intent":"send_message_placeholder"}', true),
    (NULL::uuid, 'new_inquiry', 'New inquiry', 'Go to inquiries list', 'opportunity', 'navigate', 5,
     '{"href":"/admin/opportunities"}', true),
    (NULL::uuid, 'open_enrollment_work_unit', 'Enrollment queue', 'Open workspace home', 'opportunity', 'navigate', 6,
     '{"href":"/adminV2/workspace"}', true)
) AS v(org_id, key, label, description, entity_type, action_type, priority, payload_schema, is_active)
WHERE NOT EXISTS (
    SELECT 1 FROM public.action_definitions x WHERE x.key = v.key AND x.org_id IS NOT DISTINCT FROM v.org_id
);

INSERT INTO public.action_placements (org_id, action_definition_id, surface, slot, entity_type, department_id, work_unit_id, order_index, display_style, is_active)
SELECT
    NULL::uuid,
    d.id,
    v.surface,
    v.slot,
    'opportunity',
    NULL::uuid,
    NULL::uuid,
    v.order_index,
    v.display_style,
    true
FROM (VALUES
    ('record_header'::text, 'primary'::text, 'qualify_opportunity'::text, 10, 'button'::text),
    ('record_header', 'secondary', 'start_quote', 20, 'button'),
    ('record_header', 'secondary', 'mark_lost', 30, 'button'),
    ('queue_row', 'row_inline', 'open_record', 5, 'link'),
    ('queue_row', 'row_inline', 'qualify_opportunity', 10, 'button'),
    ('queue_row', 'row_inline', 'start_quote', 20, 'button'),
    ('queue_row', 'row_inline', 'mark_lost', 40, 'button'),
    ('right_rail', 'right_rail', 'new_inquiry', 10, 'menu_item'),
    ('right_rail', 'right_rail', 'open_enrollment_work_unit', 20, 'menu_item')
) AS v(surface, slot, def_key, order_index, display_style)
JOIN public.action_definitions d ON d.org_id IS NULL AND d.key = v.def_key
WHERE NOT EXISTS (
    SELECT 1
    FROM public.action_placements p
    WHERE p.org_id IS NULL
      AND p.surface = v.surface
      AND p.slot = v.slot
      AND p.action_definition_id = d.id
      AND p.entity_type = 'opportunity'
);

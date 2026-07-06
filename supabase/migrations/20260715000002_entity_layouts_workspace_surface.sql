-- Allow workspace surface layouts in entity_layouts (Workspace Process Surface config).
-- Code persists surface='workspace' per layoutV2.ts; the earlier constraint only allowed drawer|queue.

ALTER TABLE public.entity_layouts
    DROP CONSTRAINT IF EXISTS entity_layouts_surface_check;

ALTER TABLE public.entity_layouts
    ADD CONSTRAINT entity_layouts_surface_check
    CHECK (surface = ANY (ARRAY['drawer'::text, 'queue'::text, 'workspace'::text]));

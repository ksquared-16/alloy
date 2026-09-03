-- Clear the two inert Work View `focus_panel_layout_id` values.
--
-- WHAT THESE WERE. The Work View editor used to offer a card titled "Focus Panel
-- Surface" whose options were drawn from the legacy opportunity-drawer assignment
-- slot. `entity_layouts` addresses the Focus Panel Summary as `opportunities` /
-- `drawer` — the same pair as the legacy drawer — so every published Focus Panel
-- version passed that filter and could be chosen. Two Work Views were.
--
-- WHY THEY DO NOTHING. The Focus Panel Summary does not resolve by an assigned id.
-- It selects the applicable published variant through `resolveSurfaceVariant`, by
-- the constraints a layout declares in its own metadata, breaking ties by highest
-- version. Verified against the live resolver immediately before this migration was
-- written: `new_leads` (pinning v10), `new_work_view_7` (pinning v132) and an
-- unscoped request all returned the same row at v145.
--
-- WHY CLEAR THEM ANYWAY. `focus_panel_layout_id` is not dead — it is read by
-- `/api/admin/layout-runtime/opportunity-drawer-body`, which is gated off by
-- default. Left in place, these two values would bind the legacy Drawer Body to a
-- Focus Panel Summary document the day that runtime is switched on. That is the
-- only thing this migration prevents.
--
-- BOUNDED ON PURPOSE. It matches the Work View id AND the exact layout id captured
-- under a governed read-only census, so it can only remove the two values that were
-- reviewed. Any other assignment — including a legitimate legacy drawer layout on
-- some other view — is left untouched, the surrounding work-view configuration is
-- rewritten key-for-key apart from the one removal, array order is preserved, and
-- no `entity_layouts` row is read or written: the published Focus Panel variants
-- themselves are not part of this change.
--
-- Idempotent: re-running matches nothing once the keys are gone.

UPDATE public.departments AS d
SET metadata = jsonb_set(
    d.metadata,
    '{lifecycle_builder_v1,processes}',
    COALESCE((
        SELECT jsonb_agg(
            CASE
                WHEN proc ? 'work_views_v1' THEN jsonb_set(
                    proc,
                    '{work_views_v1}',
                    COALESCE((
                        SELECT jsonb_agg(
                            CASE
                                WHEN view_row->>'id' = 'new_leads'
                                     AND view_row->>'focus_panel_layout_id'
                                         = '9db0cc6f-cf57-4eb6-b61a-5a877657ec9c'
                                    THEN view_row - 'focus_panel_layout_id'
                                WHEN view_row->>'id' = 'new_work_view_7'
                                     AND view_row->>'focus_panel_layout_id'
                                         = '9dedbfad-589f-480f-949c-2c5852d07e7d'
                                    THEN view_row - 'focus_panel_layout_id'
                                ELSE view_row
                            END
                            ORDER BY view_ord
                        )
                        FROM jsonb_array_elements(
                                 COALESCE(proc->'work_views_v1', '[]'::jsonb)
                             ) WITH ORDINALITY AS views(view_row, view_ord)
                    ), '[]'::jsonb)
                )
                ELSE proc
            END
            ORDER BY proc_ord
        )
        FROM jsonb_array_elements(
                 COALESCE(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)
             ) WITH ORDINALITY AS procs(proc, proc_ord)
    ), '[]'::jsonb)
)
WHERE d.metadata ? 'lifecycle_builder_v1'
  AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(
               COALESCE(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)
           ) AS p(proc)
      CROSS JOIN LATERAL jsonb_array_elements(
               COALESCE(p.proc->'work_views_v1', '[]'::jsonb)
           ) AS v(view_row)
      WHERE (
                v.view_row->>'id' = 'new_leads'
                AND v.view_row->>'focus_panel_layout_id' = '9db0cc6f-cf57-4eb6-b61a-5a877657ec9c'
            )
         OR (
                v.view_row->>'id' = 'new_work_view_7'
                AND v.view_row->>'focus_panel_layout_id' = '9dedbfad-589f-480f-949c-2c5852d07e7d'
            )
  );

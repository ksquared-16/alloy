-- Re-run of 20260903170000 under a new version, because that one can never execute.
--
-- The first apply of 20260903170000 was refused by the projection guard — correctly:
-- `lifecycle_builder_v1` is publication-owned and the file did not yet hold the audited
-- write token. Nothing was applied. But the runner had already recorded that version in
-- the migration ledger, so when the corrected file was applied it came back
-- `idempotent: true, ledger: applied` and was SKIPPED. A green apply, and the two values
-- still in place — verified by census immediately afterwards.
--
-- A ledger entry is a claim about a version, not about a file, so the corrected statements
-- need a version of their own. The content below is 20260903170000 as corrected, unchanged.
-- It is safe to run whether or not the values are still present: the WHERE clause matches
-- nothing once they are gone, and the verification block passes trivially when before and
-- after are identical.

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
-- reviewed. No `entity_layouts` row is read or written: the published Focus Panel
-- variants themselves are not part of this change.
--
-- AND IT CHECKS ITS OWN WORK. No CI job executes this file — the repository's
-- migration gates are path-filtered to `web/`, and Supabase Preview does not run
-- here — so the first execution is the real one. Rather than rely on that, it
-- snapshots every work view before and after and REFUSES TO COMMIT unless the only
-- difference is the two values named below: same departments, same processes, same
-- work views, same order, every other assignment untouched. A wrong rewrite aborts
-- the transaction instead of persisting.
--
-- Idempotent: re-running matches nothing once the keys are gone, and the guard
-- passes trivially because nothing differs.

CREATE TEMP TABLE _inert_focus_before ON COMMIT DROP AS
SELECT
    d.id                                        AS department_id,
    procs.proc_ord                              AS proc_ord,
    views.view_ord                              AS view_ord,
    views.view_row->>'id'                       AS view_id,
    views.view_row->>'focus_panel_layout_id'    AS focus_panel_layout_id
FROM public.departments AS d
CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)
    ) WITH ORDINALITY AS procs(proc, proc_ord)
CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(procs.proc->'work_views_v1', '[]'::jsonb)
    ) WITH ORDINALITY AS views(view_row, view_ord)
WHERE d.metadata ? 'lifecycle_builder_v1';

-- `lifecycle_builder_v1` is publication-owned: a BEFORE trigger on `departments`
-- refuses any direct write unless the transaction holds the capability token. The
-- first attempt at this migration was refused by that guard, which is the guard
-- working — and its HINT names the two sanctioned ways through.
--
-- `publish_business_process_revision_v1` is the wrong one here. That is the publish
-- loop: it mints an immutable business-process revision, and this changes no process
-- semantics. It removes two dead pointers that no runtime reads.
--
-- `begin_lifecycle_projection_write('migration')` is the other, and it exists for
-- precisely this: the guard's own migration documents "an explicit, audited
-- migration/repair mode ... for exceptional operations". The token is
-- transaction-local, so it cannot outlive this file, and the verification block
-- below still has to pass before any of it commits.
SELECT public.begin_lifecycle_projection_write('migration');

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

-- Release the token immediately: 'migration' mode does not auto-release, and a
-- token left set would authorize every later statement in this transaction.
SELECT public.end_lifecycle_projection_write();

CREATE TEMP TABLE _inert_focus_after ON COMMIT DROP AS
SELECT
    d.id                                        AS department_id,
    procs.proc_ord                              AS proc_ord,
    views.view_ord                              AS view_ord,
    views.view_row->>'id'                       AS view_id,
    views.view_row->>'focus_panel_layout_id'    AS focus_panel_layout_id
FROM public.departments AS d
CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(d.metadata->'lifecycle_builder_v1'->'processes', '[]'::jsonb)
    ) WITH ORDINALITY AS procs(proc, proc_ord)
CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(procs.proc->'work_views_v1', '[]'::jsonb)
    ) WITH ORDINALITY AS views(view_row, view_ord)
WHERE d.metadata ? 'lifecycle_builder_v1';

DO $$
DECLARE
    shape_drift   bigint;
    other_drift   bigint;
    still_pinned  bigint;
BEGIN
    -- 1 · Same rows, same order. Nothing added, dropped or moved.
    SELECT count(*) INTO shape_drift
    -- Parenthesised: set operators associate left-to-right, so without these the
    -- second EXCEPT would apply to the union rather than giving the other direction.
    FROM (
        (
            SELECT department_id, proc_ord, view_ord, view_id FROM _inert_focus_before
            EXCEPT ALL
            SELECT department_id, proc_ord, view_ord, view_id FROM _inert_focus_after
        )
        UNION ALL
        (
            SELECT department_id, proc_ord, view_ord, view_id FROM _inert_focus_after
            EXCEPT ALL
            SELECT department_id, proc_ord, view_ord, view_id FROM _inert_focus_before
        )
    ) AS drift;
    IF shape_drift <> 0 THEN
        RAISE EXCEPTION
            'work view shape changed in % row(s); expected only two assignment values to clear',
            shape_drift;
    END IF;

    -- 2 · Every assignment except the two named ones is exactly as it was.
    SELECT count(*) INTO other_drift
    FROM _inert_focus_before AS b
    JOIN _inert_focus_after AS a
      ON  a.department_id = b.department_id
      AND a.proc_ord      = b.proc_ord
      AND a.view_ord      = b.view_ord
    WHERE b.focus_panel_layout_id IS DISTINCT FROM a.focus_panel_layout_id
      AND NOT (
            a.focus_panel_layout_id IS NULL
            AND (
                (b.view_id = 'new_leads'
                 AND b.focus_panel_layout_id = '9db0cc6f-cf57-4eb6-b61a-5a877657ec9c')
             OR (b.view_id = 'new_work_view_7'
                 AND b.focus_panel_layout_id = '9dedbfad-589f-480f-949c-2c5852d07e7d')
            )
          );
    IF other_drift <> 0 THEN
        RAISE EXCEPTION
            '% unrelated focus_panel_layout_id value(s) changed; only the two reviewed values may clear',
            other_drift;
    END IF;

    -- 3 · And the two named ones are actually gone.
    SELECT count(*) INTO still_pinned
    FROM _inert_focus_after
    WHERE (view_id = 'new_leads'
           AND focus_panel_layout_id = '9db0cc6f-cf57-4eb6-b61a-5a877657ec9c')
       OR (view_id = 'new_work_view_7'
           AND focus_panel_layout_id = '9dedbfad-589f-480f-949c-2c5852d07e7d');
    IF still_pinned <> 0 THEN
        RAISE EXCEPTION
            '% targeted assignment(s) survived the update', still_pinned;
    END IF;
END
$$;

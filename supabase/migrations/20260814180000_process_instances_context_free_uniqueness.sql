-- =============================================================================
-- Context-free process journeys: one OPEN journey per (org, process, subject).
--
-- `process_instances.context_id` is nullable by design — the table's own comment
-- calls the context "generic, optional" — and a child added to Records has no
-- acquisition episode to run inside. Starting a governed journey for such a child
-- therefore produces `context_id IS NULL`.
--
-- ── WHY THE EXISTING INDEX DOES NOT COVER THIS ──
--
-- `ux_process_instances_scope (org_id, process_key, subject_id, context_id)`
-- treats NULLs as DISTINCT, which is standard SQL and correct for its purpose.
-- The consequence is that it constrains nothing at all once the context is null:
-- pressing Start Enrollment twice, or a retried request, would open a second
-- journey for the same child and Records would then be describing two.
--
-- ── WHY THIS IS NOT "ONE ENROLLMENT PER CHILD, FOREVER" ──
--
-- Re-enrollment is legitimate and common: a child leaves and returns the
-- following year. Constraining every historical journey would make that
-- impossible and would push operators into duplicate Child records to work
-- around it — the exact failure the previous slice removed.
--
-- So the predicate covers only journeys that have NOT concluded. The canonical
-- enrollment vocabulary (web/lib/process/processInstances.ts) is
-- waitlisted | enrolling | enrolled | withdrawn | not_enrolling, plus NULL at
-- intake before any outcome exists. Of those, `enrolled`, `withdrawn` and
-- `not_enrolling` END the journey; NULL, `waitlisted` and `enrolling` are still
-- open. A process whose vocabulary this migration does not know is treated as
-- open, which fails safe (refusing a duplicate) rather than permissive.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_process_instances_open_context_free
    ON public.process_instances (org_id, process_key, subject_id)
    WHERE context_id IS NULL
      AND (state IS NULL OR state NOT IN ('enrolled', 'withdrawn', 'not_enrolling'));

COMMENT ON INDEX public.ux_process_instances_open_context_free IS
    'One OPEN context-free journey per (org, process, subject). Concluded journeys (enrolled/withdrawn/not_enrolling) are excluded so a later re-enrollment episode is legal. Complements ux_process_instances_scope, which cannot constrain NULL context_id.';

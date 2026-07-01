-- workflow_events: authenticated role server-read-only for direct PostgREST.
-- Code audit (2026-05): app inserts only via createAdminClient (service_role);
-- Python workers insert via PostgREST + service key. No browser writes found.
-- Service role bypasses RLS; existing server paths unchanged.
--
-- Review before apply: confirm no external tools use an authenticated JWT to mutate this table.

DROP POLICY IF EXISTS workflow_events_modify ON public.workflow_events;
DROP POLICY IF EXISTS workflow_events_no_client_write ON public.workflow_events;

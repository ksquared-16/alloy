-- Align operational_tasks.source CHECK with app validation and My Tasks manual create.
-- App code (operationalTasksService.validateOperationalTaskCreateBody, MyTasksPanel) already
-- accepts source = 'manual' for operator-created follow-ups; foundation migration only allowed task_assist.

ALTER TABLE public.operational_tasks
    DROP CONSTRAINT IF EXISTS operational_tasks_source_check;

ALTER TABLE public.operational_tasks
    ADD CONSTRAINT operational_tasks_source_check
    CHECK (source = ANY (ARRAY['task_assist'::text, 'manual'::text]));

COMMENT ON CONSTRAINT operational_tasks_source_check ON public.operational_tasks IS
    'task_assist: Task Assist / proposal follow-ups; manual: operator-created tasks from My Tasks or admin UI.';

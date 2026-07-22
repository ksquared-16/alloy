-- Align configuration_distribution_runs with assign_program_publication_target_v1.
-- Some environments already have a subject_key/requested_by shaped runs table without publication_id.

ALTER TABLE public.configuration_distribution_runs
  ADD COLUMN IF NOT EXISTS publication_id uuid REFERENCES public.configuration_publications(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_configuration_distribution_runs_publication_id
  ON public.configuration_distribution_runs (org_id, publication_id);

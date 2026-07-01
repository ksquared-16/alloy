-- Phase 0 BP convergence: retire C4 enrollment instantiate_work seed as stage-work authority.
-- Business Process stage-entry spawn (onStageEntrySpawnWorkIntent) remains canonical.
-- Preserves workflow row; disables execution only (idempotent).

UPDATE public.workflows
SET
    enabled = false,
    updated_at = now()
WHERE metadata->>'seed_key' = 'c4_enrollment_record_tour_outcome_v1'
  AND enabled = true;

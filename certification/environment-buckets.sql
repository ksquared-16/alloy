-- =============================================================================
-- Canonical cert-environment storage buckets.
--
-- The shared `alloy-cert` stack ships no storage buckets, so any document import
-- fails with STORAGE_BUCKET_NOT_FOUND (503). `org_documents` is the default
-- ADMIN_DOCUMENTS_BUCKET, so it is ENVIRONMENT, not per-run fixture data.
--
-- It previously lived in the Configuration Discovery certification fixture, which
-- meant a certification run mutated shared environment state and its teardown
-- could not remove it without breaking the next run. Environment belongs in the
-- environment's own bootstrap; fixtures should create only what they delete.
--
-- Applied by `certification/alloy-certify seed`, which is what `alloy-stack use`
-- invokes, so a rebuilt stack has it from committed code with no manual step.
--
-- Idempotent: safe to re-run on every seed.
-- =============================================================================

insert into storage.buckets (id, name, public)
select 'org_documents', 'org_documents', false
where not exists (select 1 from storage.buckets where id = 'org_documents');

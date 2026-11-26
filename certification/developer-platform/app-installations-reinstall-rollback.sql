-- ROLLBACK for 20261221100000_app_installations_reinstall_after_revoke.sql
-- =============================================================================
-- Restores the original full unique indexes. Valid ONLY while no application has
-- been reinstalled after a disconnect: once a revoked row and its successor share
-- (application_id, org_id) or (org_id, producer_key), the full indexes cannot be
-- built. This script then REFUSES and changes nothing.
--
-- Never delete or rewrite revoked installations to make it pass: they are retained
-- history (credentials, audit, resource refs and authored facts reference them).
-- If it refuses, roll back the application code only and keep the partial
-- indexes; the previous code runs against them unchanged.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f certification/developer-platform/app-installations-reinstall-rollback.sql
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;

LOCK TABLE public.app_installations IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE app_org int; producer int;
BEGIN
    SELECT count(*) INTO app_org FROM (
        SELECT 1 FROM public.app_installations GROUP BY application_id, org_id HAVING count(*) > 1) d;
    SELECT count(*) INTO producer FROM (
        SELECT 1 FROM public.app_installations GROUP BY org_id, producer_key HAVING count(*) > 1) d;
    IF app_org > 0 OR producer > 0 THEN
        RAISE EXCEPTION 'rollback refused: % (application, org) and % (org, producer_key) pairs already have a reinstall; keep the partial indexes and roll back code only', app_org, producer;
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_app_org
    ON public.app_installations (application_id, org_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_producer_key
    ON public.app_installations (org_id, producer_key);
DROP INDEX IF EXISTS public.uq_app_installations_app_org_live;
DROP INDEX IF EXISTS public.uq_app_installations_producer_key_live;

COMMIT;

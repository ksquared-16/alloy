-- Communications V2 — PKG-05 legacy `version` column compatibility for B2 API inserts.
-- When 20260619150000 created communication_template_versions with NOT NULL `version`
-- and 20260623130000 added nullable `version_number`, new B2 rows must populate both.
-- API also writes both; this migration backfills and keeps them aligned via trigger.

UPDATE public.communication_template_versions
SET version = version_number
WHERE version IS NULL AND version_number IS NOT NULL;

UPDATE public.communication_template_versions
SET version_number = version
WHERE version_number IS NULL AND version IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_communication_template_version_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.version_number IS NOT NULL AND (NEW.version IS NULL OR NEW.version <> NEW.version_number) THEN
        NEW.version := NEW.version_number;
    ELSIF NEW.version IS NOT NULL AND NEW.version_number IS NULL THEN
        NEW.version_number := NEW.version;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_communication_template_version_legacy ON public.communication_template_versions;
CREATE TRIGGER trg_sync_communication_template_version_legacy
    BEFORE INSERT OR UPDATE OF version, version_number
    ON public.communication_template_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_communication_template_version_legacy();

COMMENT ON FUNCTION public.sync_communication_template_version_legacy() IS
    'Keeps PKG-05 legacy version and B2 version_number aligned on communication_template_versions.';

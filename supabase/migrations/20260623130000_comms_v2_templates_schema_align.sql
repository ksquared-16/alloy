-- Communications V2 — align template tables when PKG-05 (20260619150000) already exists
-- and B1 CREATE TABLE IF NOT EXISTS (20260622120000) was a no-op on remote.
-- ADDITIVE + idempotent constraint evolution only. Brings B2 API columns in line.

-- ===== communication_templates =====
ALTER TABLE public.communication_templates ADD COLUMN IF NOT EXISTS description text NULL;
ALTER TABLE public.communication_templates ADD COLUMN IF NOT EXISTS status text NULL;
ALTER TABLE public.communication_templates ADD COLUMN IF NOT EXISTS created_by uuid NULL;
ALTER TABLE public.communication_templates ADD COLUMN IF NOT EXISTS updated_by uuid NULL;

UPDATE public.communication_templates
SET status = CASE
    WHEN approval_status = 'approved' THEN 'active'
    WHEN approval_status = 'pending' THEN 'draft'
    WHEN approval_status = 'draft' THEN 'draft'
    ELSE 'draft'
END
WHERE status IS NULL;

UPDATE public.communication_templates SET status = 'draft' WHERE status IS NULL;

UPDATE public.communication_templates
SET created_by = created_by_user_id
WHERE created_by IS NULL AND created_by_user_id IS NOT NULL;

UPDATE public.communication_templates
SET category = 'general'
WHERE category IS NULL OR btrim(category) = '';

ALTER TABLE public.communication_templates ALTER COLUMN status SET DEFAULT 'draft';
ALTER TABLE public.communication_templates ALTER COLUMN category SET DEFAULT 'general';

-- Free-text category (org-defined labels); drop enum CHECK if present from a partial apply.
ALTER TABLE public.communication_templates DROP CONSTRAINT IF EXISTS communication_templates_category_check;

-- Extend channel vocabulary to match B1 API (email, sms, in_app).
ALTER TABLE public.communication_templates DROP CONSTRAINT IF EXISTS communication_templates_channel_check;
ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_channel_check
    CHECK (channel IN ('email', 'sms', 'in_app'));

ALTER TABLE public.communication_templates DROP CONSTRAINT IF EXISTS communication_templates_status_check;
ALTER TABLE public.communication_templates ADD CONSTRAINT communication_templates_status_check
    CHECK (status IN ('draft', 'active', 'archived'));

-- ===== communication_template_versions =====
ALTER TABLE public.communication_template_versions ADD COLUMN IF NOT EXISTS version_number integer NULL;
ALTER TABLE public.communication_template_versions ADD COLUMN IF NOT EXISTS token_paths text[] NOT NULL DEFAULT '{}'::text[];
ALTER TABLE public.communication_template_versions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.communication_template_versions ADD COLUMN IF NOT EXISTS created_by uuid NULL;

UPDATE public.communication_template_versions
SET version_number = version
WHERE version_number IS NULL AND version IS NOT NULL;

UPDATE public.communication_template_versions SET version_number = 1 WHERE version_number IS NULL;

UPDATE public.communication_template_versions
SET created_by = created_by_user_id
WHERE created_by IS NULL AND created_by_user_id IS NOT NULL;

UPDATE public.communication_template_versions SET body = '' WHERE body IS NULL;

CREATE INDEX IF NOT EXISTS idx_comm_template_versions_template_b2
    ON public.communication_template_versions (template_id, version_number DESC);

COMMENT ON COLUMN public.communication_templates.description IS 'Optional operator note; B2 template API.';
COMMENT ON COLUMN public.communication_templates.status IS 'B2 lifecycle (draft/active/archived); backfilled from approval_status when migrating PKG-05.';

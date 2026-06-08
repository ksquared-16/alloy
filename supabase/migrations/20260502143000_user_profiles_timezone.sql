-- Alloy Timezone Contract v1: optional IANA timezone for admin display resolution
-- (user_profiles.timezone → org_settings.metadata → UTC). No timestamp rewrites.

ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN public.user_profiles.timezone IS 'Optional IANA timezone for user-facing admin timestamps; falls back to org metadata then UTC.';

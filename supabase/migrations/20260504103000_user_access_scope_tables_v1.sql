-- =============================================================================
-- CRM access scope — Card 1 (schema + backfill only)
-- =============================================================================
-- Tables:
--   user_access_profiles     — per (user_id, org_id): department_scope + site_scope
--   user_department_access — optional explicit departments when department_scope = restricted
--   user_site_access       — optional explicit site locations when site_scope = restricted
--
-- Canonical site rows: locations.location_type = 'site' (validated by trigger).
--
-- Runtime enforcement (getAdminAccessContext, route filters) is deferred to later cards.
-- Backfill: one profile per distinct (user_id, org_id) from user_roles, both scopes = all.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- user_access_profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_access_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    department_scope text NOT NULL,
    site_scope text NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT user_access_profiles_department_scope_check
        CHECK (department_scope = ANY (ARRAY['all'::text, 'restricted'::text])),
    CONSTRAINT user_access_profiles_site_scope_check
        CHECK (site_scope = ANY (ARRAY['all'::text, 'restricted'::text]))
);

COMMENT ON TABLE public.user_access_profiles IS
    'Per-user CRM data scope within an org; capabilities remain on role_definitions / role_permission_grants + user_roles.';

COMMENT ON COLUMN public.user_access_profiles.department_scope IS
    'all = all departments in org; restricted = only departments listed in user_department_access.';

COMMENT ON COLUMN public.user_access_profiles.site_scope IS
    'all = all sites (locations.location_type = site) in org; restricted = only sites in user_site_access.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_user_access_profiles_user_org'
          AND conrelid = 'public.user_access_profiles'::regclass
    ) THEN
        ALTER TABLE public.user_access_profiles
            ADD CONSTRAINT uq_user_access_profiles_user_org UNIQUE (user_id, org_id);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_org_id
    ON public.user_access_profiles (org_id);

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_user_id
    ON public.user_access_profiles (user_id);

DROP TRIGGER IF EXISTS trg_user_access_profiles_updated_at ON public.user_access_profiles;
CREATE TRIGGER trg_user_access_profiles_updated_at
    BEFORE UPDATE ON public.user_access_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_department_access
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_department_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    department_id uuid NOT NULL REFERENCES public.departments (id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT user_department_access_profile_fk
        FOREIGN KEY (user_id, org_id)
        REFERENCES public.user_access_profiles (user_id, org_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.user_department_access IS
    'Explicit department allow-list when user_access_profiles.department_scope = restricted.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_user_department_access_user_org_dept'
          AND conrelid = 'public.user_department_access'::regclass
    ) THEN
        ALTER TABLE public.user_department_access
            ADD CONSTRAINT uq_user_department_access_user_org_dept
            UNIQUE (user_id, org_id, department_id);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_user_department_access_user_org
    ON public.user_department_access (user_id, org_id);

CREATE INDEX IF NOT EXISTS idx_user_department_access_department_id
    ON public.user_department_access (department_id);

CREATE OR REPLACE FUNCTION public.validate_user_department_access_org_match()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    d_org uuid;
BEGIN
    SELECT d.org_id INTO d_org
    FROM public.departments AS d
    WHERE d.id = NEW.department_id;

    IF d_org IS NULL THEN
        RAISE EXCEPTION 'user_department_access: department_id % does not exist', NEW.department_id
            USING ERRCODE = '23503';
    END IF;

    IF d_org <> NEW.org_id THEN
        RAISE EXCEPTION 'user_department_access: org_id on row (%) must match departments.org_id (%) for department_id %',
            NEW.org_id, d_org, NEW.department_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_user_department_access_org_match() IS
    'Ensures user_department_access.org_id matches departments.org_id for department_id (CRM scope integrity).';

DROP TRIGGER IF EXISTS trg_validate_user_department_access_org_match ON public.user_department_access;
CREATE TRIGGER trg_validate_user_department_access_org_match
    BEFORE INSERT OR UPDATE
    ON public.user_department_access
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_user_department_access_org_match();

DROP TRIGGER IF EXISTS trg_user_department_access_updated_at ON public.user_department_access;
CREATE TRIGGER trg_user_department_access_updated_at
    BEFORE UPDATE ON public.user_department_access
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- user_site_access
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_site_access (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id uuid NOT NULL,
    org_id uuid NOT NULL,
    location_id uuid NOT NULL REFERENCES public.locations (id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz,
    CONSTRAINT user_site_access_profile_fk
        FOREIGN KEY (user_id, org_id)
        REFERENCES public.user_access_profiles (user_id, org_id)
        ON DELETE CASCADE
);

COMMENT ON TABLE public.user_site_access IS
    'Explicit site allow-list (locations.location_type = site) when user_access_profiles.site_scope = restricted.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'uq_user_site_access_user_org_location'
          AND conrelid = 'public.user_site_access'::regclass
    ) THEN
        ALTER TABLE public.user_site_access
            ADD CONSTRAINT uq_user_site_access_user_org_location
            UNIQUE (user_id, org_id, location_id);
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_user_site_access_user_org
    ON public.user_site_access (user_id, org_id);

CREATE INDEX IF NOT EXISTS idx_user_site_access_location_id
    ON public.user_site_access (location_id);

CREATE OR REPLACE FUNCTION public.validate_user_site_access_site_and_org()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    loc_org uuid;
    loc_type text;
BEGIN
    SELECT l.org_id, l.location_type
    INTO loc_org, loc_type
    FROM public.locations AS l
    WHERE l.id = NEW.location_id;

    IF loc_org IS NULL THEN
        RAISE EXCEPTION 'user_site_access: location_id % does not exist', NEW.location_id
            USING ERRCODE = '23503';
    END IF;

    IF loc_org <> NEW.org_id THEN
        RAISE EXCEPTION 'user_site_access: org_id on row (%) must match locations.org_id (%) for location_id %',
            NEW.org_id, loc_org, NEW.location_id
            USING ERRCODE = '23514';
    END IF;

    IF loc_type IS DISTINCT FROM 'site'::text THEN
        RAISE EXCEPTION 'user_site_access: location_id % must have location_type = site (got %)',
            NEW.location_id, loc_type
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_user_site_access_site_and_org() IS
    'Ensures user_site_access references an existing locations row with same org_id and location_type = site.';

DROP TRIGGER IF EXISTS trg_validate_user_site_access_site_and_org ON public.user_site_access;
CREATE TRIGGER trg_validate_user_site_access_site_and_org
    BEFORE INSERT OR UPDATE
    ON public.user_site_access
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_user_site_access_site_and_org();

DROP TRIGGER IF EXISTS trg_user_site_access_updated_at ON public.user_site_access;
CREATE TRIGGER trg_user_site_access_updated_at
    BEFORE UPDATE ON public.user_site_access
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Grants: admin paths use service_role; narrow grants until APIs land (later cards).
-- -----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.user_access_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.user_department_access FROM PUBLIC;
REVOKE ALL ON TABLE public.user_site_access FROM PUBLIC;

GRANT ALL ON TABLE public.user_access_profiles TO postgres;
GRANT ALL ON TABLE public.user_department_access TO postgres;
GRANT ALL ON TABLE public.user_site_access TO postgres;

GRANT ALL ON TABLE public.user_access_profiles TO service_role;
GRANT ALL ON TABLE public.user_department_access TO service_role;
GRANT ALL ON TABLE public.user_site_access TO service_role;

ALTER TABLE public.user_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_department_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_site_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_access_profiles_all_service_role ON public.user_access_profiles;
CREATE POLICY user_access_profiles_all_service_role ON public.user_access_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS user_department_access_all_service_role ON public.user_department_access;
CREATE POLICY user_department_access_all_service_role ON public.user_department_access
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS user_site_access_all_service_role ON public.user_site_access;
CREATE POLICY user_site_access_all_service_role ON public.user_site_access
    FOR ALL TO service_role USING (true) WITH CHECK (true);

-- No authenticated policies yet — JWT clients cannot read/write until explicitly allowed.

-- -----------------------------------------------------------------------------
-- Backfill profiles from org membership (legacy-safe: full org visibility)
-- -----------------------------------------------------------------------------
INSERT INTO public.user_access_profiles (user_id, org_id, department_scope, site_scope)
SELECT DISTINCT ur.user_id, ur.org_id, 'all'::text, 'all'::text
FROM public.user_roles AS ur
ON CONFLICT (user_id, org_id) DO NOTHING;

-- =============================================================================
-- Verification queries (run manually after migrate / db reset)
-- =============================================================================
-- Row counts vs membership:
--   SELECT COUNT(*) AS profiles FROM public.user_access_profiles;
--   SELECT COUNT(DISTINCT (user_id, org_id)) AS distinct_pairs FROM public.user_roles;
--
-- Every membership pair should have a profile after backfill:
--   SELECT ur.user_id, ur.org_id
--   FROM public.user_roles ur
--   GROUP BY ur.user_id, ur.org_id
--   EXCEPT
--   SELECT p.user_id, p.org_id FROM public.user_access_profiles p;
--
-- Spot-check scopes:
--   SELECT department_scope, site_scope, COUNT(*) FROM public.user_access_profiles GROUP BY 1, 2;
--
-- Trigger sanity (expect exception: row org_id does not match department.org_id):
--   INSERT INTO user_department_access (user_id, org_id, department_id)
--   SELECT p.user_id, p.org_id, d.id FROM user_access_profiles p CROSS JOIN departments d
--   WHERE d.org_id <> p.org_id LIMIT 1;
--
-- Trigger sanity (expect exception: non-site location):
--   INSERT INTO user_site_access (user_id, org_id, location_id)
--   SELECT p.user_id, p.org_id, l.id
--   FROM user_access_profiles p
--   JOIN locations l ON l.org_id = p.org_id AND l.location_type <> 'site'
--   LIMIT 1;
-- =============================================================================

-- Organization Calculations (Path B proving slice)
-- Org-authored versioned AST compositions over approved platform functions.
-- Published versions are immutable (AST freeze).

CREATE TABLE IF NOT EXISTS public.organization_calculations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    key text NOT NULL,
    name text NOT NULL,
    description text,
    subject_grain text NOT NULL DEFAULT 'room'
        CHECK (subject_grain IN ('room')),
    lifecycle text NOT NULL DEFAULT 'draft'
        CHECK (lifecycle IN ('draft', 'published', 'archived')),
    published_version_id uuid,
    created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organization_calculations_key_nonempty
        CHECK (char_length(btrim(key)) > 0),
    CONSTRAINT organization_calculations_name_nonempty
        CHECK (char_length(btrim(name)) > 0),
    CONSTRAINT organization_calculations_org_key_unique
        UNIQUE (org_id, key)
);

COMMENT ON TABLE public.organization_calculations IS
    'Organization-authored governed calculations (Path B). Metadata + lifecycle; expression lives on versions.';

CREATE TABLE IF NOT EXISTS public.organization_calculation_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_calculation_id uuid NOT NULL
        REFERENCES public.organization_calculations (id) ON DELETE CASCADE,
    org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
    version_number integer NOT NULL CHECK (version_number >= 1),
    expression_ast jsonb NOT NULL,
    dependency_refs text[] NOT NULL DEFAULT '{}',
    consumer_bindings jsonb NOT NULL DEFAULT '{}'::jsonb,
    published_at timestamptz,
    published_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
    immutable boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT organization_calculation_versions_unique_number
        UNIQUE (organization_calculation_id, version_number)
);

COMMENT ON TABLE public.organization_calculation_versions IS
    'Immutable-after-publish AST versions for organization_calculations. Never UPDATE expression_ast when immutable.';

ALTER TABLE public.organization_calculations
    DROP CONSTRAINT IF EXISTS organization_calculations_published_version_fk;
ALTER TABLE public.organization_calculations
    ADD CONSTRAINT organization_calculations_published_version_fk
    FOREIGN KEY (published_version_id)
    REFERENCES public.organization_calculation_versions (id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_calculations_org_updated_idx
    ON public.organization_calculations (org_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS organization_calculation_versions_org_calc_idx
    ON public.organization_calculation_versions (org_id, organization_calculation_id, version_number);

-- Reject AST / dependency mutation on immutable versions.
-- consumer_bindings may still change so runtime can rebind an exact published version.
CREATE OR REPLACE FUNCTION public.organization_calculation_version_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.immutable IS TRUE THEN
        IF NEW.expression_ast IS DISTINCT FROM OLD.expression_ast
            OR NEW.dependency_refs IS DISTINCT FROM OLD.dependency_refs
            OR NEW.version_number IS DISTINCT FROM OLD.version_number
            OR NEW.organization_calculation_id IS DISTINCT FROM OLD.organization_calculation_id
            OR NEW.org_id IS DISTINCT FROM OLD.org_id
            OR NEW.immutable IS DISTINCT FROM OLD.immutable
        THEN
            RAISE EXCEPTION 'organization_calculation_version_immutable'
                USING ERRCODE = '22023',
                    HINT = 'Published organization calculation versions cannot be mutated; create a new draft version.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organization_calculation_version_immutable
    ON public.organization_calculation_versions;
CREATE TRIGGER trg_organization_calculation_version_immutable
    BEFORE UPDATE ON public.organization_calculation_versions
    FOR EACH ROW
    EXECUTE FUNCTION public.organization_calculation_version_immutable_guard();

ALTER TABLE public.organization_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_calculation_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organization_calculations_select_org ON public.organization_calculations;
CREATE POLICY organization_calculations_select_org
    ON public.organization_calculations
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS organization_calculations_write_admin ON public.organization_calculations;
CREATE POLICY organization_calculations_write_admin
    ON public.organization_calculations
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS organization_calculations_service_role_all ON public.organization_calculations;
CREATE POLICY organization_calculations_service_role_all
    ON public.organization_calculations
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS organization_calculation_versions_select_org ON public.organization_calculation_versions;
CREATE POLICY organization_calculation_versions_select_org
    ON public.organization_calculation_versions
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text, 'ops'::text, 'manager'::text]));

DROP POLICY IF EXISTS organization_calculation_versions_write_admin ON public.organization_calculation_versions;
CREATE POLICY organization_calculation_versions_write_admin
    ON public.organization_calculation_versions
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS organization_calculation_versions_service_role_all ON public.organization_calculation_versions;
CREATE POLICY organization_calculation_versions_service_role_all
    ON public.organization_calculation_versions
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

GRANT SELECT ON TABLE public.organization_calculations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_calculations TO service_role;
GRANT SELECT ON TABLE public.organization_calculation_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_calculation_versions TO service_role;

REVOKE ALL ON FUNCTION public.organization_calculation_version_immutable_guard() FROM PUBLIC;

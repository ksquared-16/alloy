-- Person ↔ Child relationship instance (canonical edge grain).
-- One stable relationship per (org, customer_member, person). Roles and kinship are separate.

CREATE TABLE IF NOT EXISTS public.person_child_relationships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
    customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    customer_member_id uuid NOT NULL REFERENCES public.customer_members(id) ON DELETE CASCADE,
    person_id uuid NOT NULL REFERENCES public.persons(id) ON DELETE CASCADE,
    relationship_type text,
    priority integer,
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    CONSTRAINT uq_person_child_relationships_member_person UNIQUE (org_id, customer_member_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_person_child_relationships_org_member
    ON public.person_child_relationships (org_id, customer_member_id);
CREATE INDEX IF NOT EXISTS idx_person_child_relationships_org_person
    ON public.person_child_relationships (org_id, person_id);
CREATE INDEX IF NOT EXISTS idx_person_child_relationships_org_customer
    ON public.person_child_relationships (org_id, customer_id);

CREATE TABLE IF NOT EXISTS public.person_child_relationship_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE RESTRICT,
    relationship_id uuid NOT NULL REFERENCES public.person_child_relationships(id) ON DELETE CASCADE,
    role_key text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz,
    CONSTRAINT uq_person_child_relationship_roles UNIQUE (org_id, relationship_id, role_key)
);

CREATE INDEX IF NOT EXISTS idx_person_child_relationship_roles_rel
    ON public.person_child_relationship_roles (org_id, relationship_id);

CREATE OR REPLACE FUNCTION public.validate_person_child_relationships_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    cust_org uuid;
    member_org uuid;
    member_customer uuid;
    person_org uuid;
BEGIN
    SELECT c.org_id INTO cust_org FROM public.customers c WHERE c.id = NEW.customer_id;
    IF cust_org IS NULL THEN
        RAISE EXCEPTION 'person_child_relationships: customer_id % not found', NEW.customer_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM cust_org THEN
        RAISE EXCEPTION 'person_child_relationships: org_id mismatch with customer';
    END IF;

    SELECT cm.org_id, cm.customer_id INTO member_org, member_customer
    FROM public.customer_members cm WHERE cm.id = NEW.customer_member_id;
    IF member_org IS NULL THEN
        RAISE EXCEPTION 'person_child_relationships: customer_member_id % not found', NEW.customer_member_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM member_org THEN
        RAISE EXCEPTION 'person_child_relationships: org_id mismatch with customer_member';
    END IF;
    IF NEW.customer_id IS DISTINCT FROM member_customer THEN
        RAISE EXCEPTION 'person_child_relationships: customer_id mismatch with customer_member';
    END IF;

    SELECT p.org_id INTO person_org FROM public.persons p WHERE p.id = NEW.person_id;
    IF person_org IS NULL THEN
        RAISE EXCEPTION 'person_child_relationships: person_id % not found', NEW.person_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM person_org THEN
        RAISE EXCEPTION 'person_child_relationships: org_id mismatch with person';
    END IF;

    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_person_child_relationships_consistency ON public.person_child_relationships;
CREATE TRIGGER trg_validate_person_child_relationships_consistency
BEFORE INSERT OR UPDATE ON public.person_child_relationships
FOR EACH ROW EXECUTE FUNCTION public.validate_person_child_relationships_consistency();

CREATE OR REPLACE FUNCTION public.validate_person_child_relationship_roles_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
    rel_org uuid;
    rel_status text;
BEGIN
    SELECT r.org_id, r.status INTO rel_org, rel_status
    FROM public.person_child_relationships r WHERE r.id = NEW.relationship_id;
    IF rel_org IS NULL THEN
        RAISE EXCEPTION 'person_child_relationship_roles: relationship_id % not found', NEW.relationship_id;
    END IF;
    IF NEW.org_id IS DISTINCT FROM rel_org THEN
        RAISE EXCEPTION 'person_child_relationship_roles: org_id mismatch with relationship';
    END IF;
    IF rel_status = 'inactive' AND NEW.is_active = true THEN
        RAISE EXCEPTION 'person_child_relationship_roles: cannot activate role on inactive relationship';
    END IF;
    RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_validate_person_child_relationship_roles_consistency ON public.person_child_relationship_roles;
CREATE TRIGGER trg_validate_person_child_relationship_roles_consistency
BEFORE INSERT OR UPDATE ON public.person_child_relationship_roles
FOR EACH ROW EXECUTE FUNCTION public.validate_person_child_relationship_roles_consistency();

DROP TRIGGER IF EXISTS trg_person_child_relationships_updated_at ON public.person_child_relationships;
CREATE TRIGGER trg_person_child_relationships_updated_at
BEFORE UPDATE ON public.person_child_relationships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_person_child_relationship_roles_updated_at ON public.person_child_relationship_roles;
CREATE TRIGGER trg_person_child_relationship_roles_updated_at
BEFORE UPDATE ON public.person_child_relationship_roles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.person_child_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.person_child_relationship_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS person_child_relationships_select_org ON public.person_child_relationships;
CREATE POLICY person_child_relationships_select_org ON public.person_child_relationships
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS person_child_relationships_write_org ON public.person_child_relationships;
CREATE POLICY person_child_relationships_write_org ON public.person_child_relationships
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS person_child_relationship_roles_select_org ON public.person_child_relationship_roles;
CREATE POLICY person_child_relationship_roles_select_org ON public.person_child_relationship_roles
    FOR SELECT TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));

DROP POLICY IF EXISTS person_child_relationship_roles_write_org ON public.person_child_relationship_roles;
CREATE POLICY person_child_relationship_roles_write_org ON public.person_child_relationship_roles
    FOR ALL TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']))
    WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));

DROP POLICY IF EXISTS person_child_relationships_service_role_all ON public.person_child_relationships;
CREATE POLICY person_child_relationships_service_role_all ON public.person_child_relationships
    FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS person_child_relationship_roles_service_role_all ON public.person_child_relationship_roles;
CREATE POLICY person_child_relationship_roles_service_role_all ON public.person_child_relationship_roles
    FOR ALL TO service_role USING (true) WITH CHECK (true);

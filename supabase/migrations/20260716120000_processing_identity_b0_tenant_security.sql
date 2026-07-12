-- =============================================================================
-- Processing Identity Resolution — B0 Tenant Security Prerequisites
-- =============================================================================
-- Gate G2: close cross-tenant identity exposure before candidate discovery.
--
-- Confirmed defects (current-state audit):
--   • admin_ops_full_access on identity tables checks app_users.role globally
--     (no org_id predicate) → org-A admin/ops can read/write org-B rows.
--   • persons.org_id has no FK to orgs (integrity gap; org-scoped RLS already
--     uses user_roles on persons — this migration adds the FK only).
--
-- In scope:
--   • Replace admin_ops_full_access with has_org_role(org_id, …) on:
--       customers, opportunities, opportunity_customer_members,
--       opportunity_persons
--   • Drop admin_ops_full_access on contacts (org-scoped CRUD already exists)
--   • Add persons_org_id_fkey after orphan preflight
--
-- Out of scope (later slices):
--   • contacts global email/phone unique indexes (Phase E / gate G10)
--   • persons/customer_members identity uniqueness (D0)
--   • Processing/resolver tables (B2+)
--
-- Idempotent: DROP POLICY IF EXISTS before CREATE; FK guarded via pg_constraint.
-- =============================================================================

SET search_path TO public;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers',
    'opportunities',
    'opportunity_customer_members',
    'opportunity_persons'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS admin_ops_full_access ON public.%I;', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_select_org', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
        USING (public.has_org_role(org_id, ARRAY['owner','admin','ops','manager']));$p$,
      t || '_select_org', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_insert_org', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
        WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));$p$,
      t || '_insert_org', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_update_org', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
        USING (public.has_org_role(org_id, ARRAY['owner','admin','ops']))
        WITH CHECK (public.has_org_role(org_id, ARRAY['owner','admin','ops']));$p$,
      t || '_update_org', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_delete_org', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
        USING (public.has_org_role(org_id, ARRAY['owner','admin']));$p$,
      t || '_delete_org', t
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_all_service_role', t);
    EXECUTE format(
      $p$CREATE POLICY %I ON public.%I FOR ALL TO service_role
        USING (true) WITH CHECK (true);$p$,
      t || '_all_service_role', t
    );
  END LOOP;
END $$;

-- contacts: org-scoped insert/select/update already exist; remove cross-tenant ALL
DROP POLICY IF EXISTS admin_ops_full_access ON public.contacts;

DROP POLICY IF EXISTS contacts_delete_by_org_role ON public.contacts;
CREATE POLICY contacts_delete_by_org_role ON public.contacts
    FOR DELETE TO authenticated
    USING (public.has_org_role(org_id, ARRAY['owner'::text, 'admin'::text]));

DROP POLICY IF EXISTS contacts_all_service_role ON public.contacts;
CREATE POLICY contacts_all_service_role ON public.contacts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- persons.org_id → orgs(id) FK (integrity prerequisite)
-- Preflight: SELECT count(*) FROM persons p LEFT JOIN orgs o ON o.id = p.org_id WHERE o.id IS NULL;
-- Must return 0 before this migration can apply in production.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.persons p
        LEFT JOIN public.orgs o ON o.id = p.org_id
        WHERE o.id IS NULL
        LIMIT 1
    ) THEN
        RAISE EXCEPTION 'persons_org_id_fkey preflight failed: persons rows reference missing org_id';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'persons_org_id_fkey'
          AND conrelid = 'public.persons'::regclass
    ) THEN
        ALTER TABLE public.persons
            ADD CONSTRAINT persons_org_id_fkey
            FOREIGN KEY (org_id) REFERENCES public.orgs (id) ON DELETE RESTRICT;
    END IF;
END $$;

COMMENT ON CONSTRAINT persons_org_id_fkey ON public.persons IS
    'B0: canonical person records must belong to a valid org (tenant ownership integrity).';

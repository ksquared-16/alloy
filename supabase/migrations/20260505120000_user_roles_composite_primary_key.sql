-- user_roles: replace legacy PRIMARY KEY (user_id) with PRIMARY KEY (user_id, org_id, role).
--
-- Remote baseline incorrectly enforced one membership row per auth user globally, blocking multiple
-- roles per org (e.g. ops + regional_lead). The intended model is UNIQUE (user_id, org_id, role).
--
-- Idempotent:
-- - No-op when user_roles_pkey already spans (user_id, org_id, role).
-- - Drops legacy user_roles_pkey only when it is a single-column key on user_id.
-- - Promotes existing uniq_user_roles_user_org_role when present; otherwise creates it then attaches PK.
--
-- USING INDEX must name the index without a schema qualifier (Postgres rejects public.idx).
--
-- Transactionality: migrations run in a single DB transaction by default. If this file fails mid-run,
-- the transaction aborts — expect remote user_roles_pkey and uniq_user_roles_user_org_role unchanged
-- from pre-migration state (legacy PK + baseline unique index still present). Safe to rerun after fix:
-- composite_pk_present skips PK work; CREATE UNIQUE INDEX IF NOT EXISTS is idempotent.

DO $$
DECLARE
    composite_pk_present boolean;
    legacy_single_pk_present boolean;
    pk_missing boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        INNER JOIN pg_class r ON r.oid = c.conrelid
        INNER JOIN pg_namespace ns ON ns.oid = r.relnamespace
        WHERE ns.nspname = 'public'
          AND r.relname = 'user_roles'
          AND c.contype = 'p'
          AND c.conname = 'user_roles_pkey'
          AND array_length(c.conkey, 1) = 3
    )
    INTO composite_pk_present;

    IF composite_pk_present THEN
        RAISE NOTICE 'user_roles: composite PRIMARY KEY already present — skipping PK migration';
    ELSE
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint c
        INNER JOIN pg_class r ON r.oid = c.conrelid
        INNER JOIN pg_namespace ns ON ns.oid = r.relnamespace
        INNER JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum = ANY (c.conkey)
        WHERE ns.nspname = 'public'
          AND r.relname = 'user_roles'
          AND c.contype = 'p'
          AND c.conname = 'user_roles_pkey'
          AND array_length(c.conkey, 1) = 1
          AND a.attname = 'user_id'
          AND NOT a.attisdropped
    )
    INTO legacy_single_pk_present;

    IF legacy_single_pk_present THEN
        ALTER TABLE public.user_roles DROP CONSTRAINT user_roles_pkey;
        RAISE NOTICE 'user_roles: dropped legacy PRIMARY KEY (user_id)';
    END IF;

    SELECT NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        INNER JOIN pg_class r ON r.oid = c.conrelid
        INNER JOIN pg_namespace ns ON ns.oid = r.relnamespace
        WHERE ns.nspname = 'public'
          AND r.relname = 'user_roles'
          AND c.contype = 'p'
    )
    INTO pk_missing;

    IF pk_missing THEN
        CREATE UNIQUE INDEX IF NOT EXISTS uniq_user_roles_user_org_role
            ON public.user_roles (user_id, org_id, role);

        ALTER TABLE public.user_roles
            ADD CONSTRAINT user_roles_pkey PRIMARY KEY USING INDEX uniq_user_roles_user_org_role;

        RAISE NOTICE 'user_roles: created composite PRIMARY KEY (user_id, org_id, role)';
    END IF;
    END IF;
END $$;

-- Supporting indexes (IF NOT EXISTS keeps migration safe if names already exist from baseline).
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_org_id ON public.user_roles (org_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_org_id ON public.user_roles (user_id, org_id);

COMMENT ON CONSTRAINT user_roles_pkey ON public.user_roles IS
    'One membership row per (user, org, role); supports multiple roles per user per org.';

-- -----------------------------------------------------------------------------
-- Verification (run manually after migrate):
--
-- SELECT c.conname AS pk_name,
--        string_agg(a.attname, ', ' ORDER BY ord.ordinality) AS pk_columns
-- FROM pg_constraint c
-- JOIN pg_class r ON r.oid = c.conrelid
-- JOIN pg_namespace ns ON ns.oid = r.relnamespace
-- JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS ord(attnum, ordinality) ON TRUE
-- JOIN pg_attribute a ON a.attrelid = r.oid AND a.attnum = ord.attnum AND NOT a.attisdropped
-- WHERE ns.nspname = 'public'
--   AND r.relname = 'user_roles'
--   AND c.contype = 'p'
-- GROUP BY c.conname;
--
-- Expected pk_columns: user_id, org_id, role
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'user_roles'
-- ORDER BY indexname;
--
-- Duplicate (user_id, org_id, role) triples — expect 0 rows:
-- SELECT user_id, org_id, role, COUNT(*) AS n
-- FROM public.user_roles
-- GROUP BY user_id, org_id, role
-- HAVING COUNT(*) > 1;
--
-- Sample multi-role memberships — optional sanity check after seeds:
-- SELECT user_id, org_id, COUNT(*) AS role_rows
-- FROM public.user_roles
-- GROUP BY user_id, org_id
-- HAVING COUNT(*) > 1;
-- -----------------------------------------------------------------------------

-- Developer Platform — reinstall after disconnect (app_installations uniqueness)
-- =============================================================================
-- Found by the Documents D9-H1 hosted rerun (qar_31100f9d04e5): an application
-- disconnected from an organization could never be connected again, because
-- uq_app_installations_app_org and uq_app_installations_producer_key counted the
-- retained revoked rows. Migration 20261221100000 makes both partial on
-- `status <> 'revoked'`.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/developer_platform/installation_reinstall_cert.sql
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -v candidate=1 -f supabase/tests/developer_platform/installation_reinstall_cert.sql
--
-- With `-v candidate=1` the migration is applied INSIDE this transaction first, so
-- an unmigrated database can certify the candidate. Without it, it certifies the
-- schema as found; on the pre-migration schema C3 fails, which is the regression.
--
--   C1  a second ACTIVE installation of one application in one org is refused
--   C2  a SUSPENDED installation still holds the slot
--   C3  disconnect → reinstall succeeds, reusing the producer key; the revoked row is kept
--   C4  the revoked predecessor cannot be reactivated beside its successor
--   C5  two live installations can never coexist, whatever the order of writes
--
-- Every row is created here and removed by ROLLBACK. Nothing is left behind.
-- (Concurrency: a unique index is enforced per insert under the index lock, so
-- two racing transactions resolve to one 23505; the web live suite
-- installationReinstall.live.test.ts races six inserts when a live executor runs it.)
-- =============================================================================

\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = notice;

\if :{?candidate}
\echo 'applying candidate migration 20261221100000 inside the transaction'
\ir ../../migrations/20261221100000_app_installations_reinstall_after_revoke.sql
\endif

CREATE TEMP TABLE ri_ctx AS
SELECT '00000000-0000-4000-8000-000000000001'::uuid AS org_id,
       gen_random_uuid() AS app_id,
       'reinstall-sql-cert-' || txid_current()::text AS slug;

INSERT INTO public.developer_applications (id, slug, name, publisher, ownership_mode, environment)
SELECT app_id, slug, 'Reinstall SQL Cert', 'alloy-certification', 'alloy_managed', 'sandbox' FROM ri_ctx;

CREATE TEMP TABLE ri_ids (k text PRIMARY KEY, id uuid);

CREATE OR REPLACE FUNCTION pg_temp.ri_install() RETURNS uuid LANGUAGE sql AS $$
    INSERT INTO public.app_installations
        (application_id, org_id, granted_scopes, boundary_mode, location_boundary, producer_key, status)
    SELECT app_id, org_id, ARRAY['documents.read'], 'org_wide', ARRAY[]::uuid[], slug || ':' || org_id, 'active'
    FROM ri_ctx
    RETURNING id
$$;

CREATE OR REPLACE FUNCTION pg_temp.ri_refused(what text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    PERFORM pg_temp.ri_install();
    RAISE EXCEPTION 'FAIL %: a second live installation was accepted', what;
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS %', what;
END $$;

-- C1
INSERT INTO ri_ids SELECT 'first', pg_temp.ri_install();
SELECT pg_temp.ri_refused('C1 second active installation refused');

-- C2
UPDATE public.app_installations SET status = 'suspended', suspended_at = now()
WHERE id = (SELECT id FROM ri_ids WHERE k = 'first');
SELECT pg_temp.ri_refused('C2 suspended installation still holds the slot');
UPDATE public.app_installations SET status = 'active', suspended_at = NULL
WHERE id = (SELECT id FROM ri_ids WHERE k = 'first');

-- C3
UPDATE public.app_installations SET status = 'revoked', revoked_at = now()
WHERE id = (SELECT id FROM ri_ids WHERE k = 'first');
DO $$
DECLARE second_id uuid;
BEGIN
    BEGIN
        second_id := pg_temp.ri_install();
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'FAIL C3: reinstall after disconnect refused (%)', SQLERRM;
    END;
    INSERT INTO ri_ids VALUES ('second', second_id);
    IF (SELECT count(*) FROM public.app_installations i JOIN ri_ctx c ON i.application_id = c.app_id
        WHERE i.status = 'revoked' AND i.revoked_at IS NOT NULL AND i.id = (SELECT id FROM ri_ids WHERE k = 'first')) <> 1 THEN
        RAISE EXCEPTION 'FAIL C3: the revoked installation was not retained';
    END IF;
    IF (SELECT count(DISTINCT producer_key) FROM public.app_installations i JOIN ri_ctx c ON i.application_id = c.app_id) <> 1 THEN
        RAISE EXCEPTION 'FAIL C3: the reinstall did not reuse the producer key';
    END IF;
    RAISE NOTICE 'PASS C3 disconnect -> reinstall, revoked row retained, producer key reused';
END $$;

-- C4
DO $$
BEGIN
    UPDATE public.app_installations SET status = 'active', revoked_at = NULL
    WHERE id = (SELECT id FROM ri_ids WHERE k = 'first');
    RAISE EXCEPTION 'FAIL C4: a revoked installation was reactivated beside its successor';
EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'PASS C4 revoked predecessor cannot be reactivated beside its successor';
END $$;

-- C5
DO $$
DECLARE live int;
BEGIN
    SELECT count(*) INTO live FROM public.app_installations i JOIN ri_ctx c ON i.application_id = c.app_id
    WHERE i.status <> 'revoked';
    IF live <> 1 THEN RAISE EXCEPTION 'FAIL C5: % live installations', live; END IF;
    RAISE NOTICE 'PASS C5 exactly one live installation (% rows retained in total)',
        (SELECT count(*) FROM public.app_installations i JOIN ri_ctx c ON i.application_id = c.app_id);
END $$;

ROLLBACK;

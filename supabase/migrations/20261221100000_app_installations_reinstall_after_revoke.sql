-- ═════════════════════════════════════════════════════════════════════════════
-- Reinstall after disconnect: one LIVE installation per application per org
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 20260910190000 made (application_id, org_id) and (org_id, producer_key)
-- unique across EVERY row, revoked ones included. Disconnecting is a soft
-- revoke — the row is kept as history, and credentials, audit rows, resource
-- refs and authored facts point at it — so once an application had been
-- disconnected from an organization it could never be connected again: the
-- insert hit uq_app_installations_app_org (and, with the default producer key
-- `<slug>:<org>`, uq_app_installations_producer_key) and the route answered
-- "already connected".
--
-- The rule the product means is "at most one installation that can still act".
-- The runtime's own definition of that is `status`: both principal resolvers
-- refuse any installation whose status is not 'active', and 'suspended' is
-- reversible, so it still occupies the slot. Only 'revoked' (terminal) frees it.
--
-- The producer key is reused by a reinstall ON PURPOSE: it is the durable
-- provenance of the external system, and attendance ingestion derives its
-- idempotency key from it, so a reinstalled producer replaying old events
-- dedupes against what it already authored instead of duplicating it.
--
-- Revoked rows are not touched. Each new index is built before the old one is
-- dropped, so the table is never without the constraint, and each enforces a
-- subset of what the old one did: no existing row can violate it.
--
-- ROLLBACK (only valid while no application has been reinstalled after a
-- disconnect; check first — never delete revoked rows to make it pass):
--   SELECT application_id, org_id, count(*) FROM public.app_installations
--     GROUP BY 1, 2 HAVING count(*) > 1;            -- must return no rows
--   SELECT org_id, producer_key, count(*) FROM public.app_installations
--     GROUP BY 1, 2 HAVING count(*) > 1;            -- must return no rows
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_app_org
--       ON public.app_installations (application_id, org_id);
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_producer_key
--       ON public.app_installations (org_id, producer_key);
--   DROP INDEX IF EXISTS public.uq_app_installations_app_org_live;
--   DROP INDEX IF EXISTS public.uq_app_installations_producer_key_live;
-- Once a reinstall exists, roll back the application code only and leave these
-- indexes in place: the previous code works against them unchanged.

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_app_org_live
    ON public.app_installations (application_id, org_id)
    WHERE status <> 'revoked';

CREATE UNIQUE INDEX IF NOT EXISTS uq_app_installations_producer_key_live
    ON public.app_installations (org_id, producer_key)
    WHERE status <> 'revoked';

DROP INDEX IF EXISTS public.uq_app_installations_app_org;
DROP INDEX IF EXISTS public.uq_app_installations_producer_key;

COMMENT ON INDEX public.uq_app_installations_app_org_live IS
    'At most one non-revoked installation per application per organization. Revoked installations are retained history and do not block a reinstall.';
COMMENT ON INDEX public.uq_app_installations_producer_key_live IS
    'A producer key names at most one non-revoked installation in an organization; a reinstall reuses its predecessor''s key so provenance and ingestion idempotency carry over.';

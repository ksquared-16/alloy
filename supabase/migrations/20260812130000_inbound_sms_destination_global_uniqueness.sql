-- One inbound SMS destination belongs to exactly one tenant.
--
-- `communication_bindings_org_inbound_to_uq` is scoped `(org_id, inbound_to_e164)`,
-- so two organizations could each claim the same Twilio number and inbound routing
-- would find two owners. Email closed this at birth with a GLOBAL index; SMS never
-- did, and it was left alone because reaching the misconfiguration required SQL.
--
-- The Organization Communications connect flow changes that calculus: an admin can
-- now type a receiving number into a form. A weakness that needed database access
-- is now one field away, so the constraint is worth the migration it always was.
--
-- Mirrors the email index exactly — same shape, same collision path, so both
-- channels produce the identical operator-safe message rather than one leaking a
-- raw constraint error. Phone numbers carry no case, so no `lower()`; the surface
-- normalizes to E.164 before writing.
--
-- Additive only. No destructive DDL, no data mutation, no backfill.

-- ---------------------------------------------------------------------------
-- Guard: refuse to proceed on data the constraint would silently arbitrate
-- ---------------------------------------------------------------------------
--
-- A bare CREATE UNIQUE INDEX against existing duplicates fails with an opaque
-- Postgres error naming an index nobody has heard of. Two tenants claiming one
-- number is a real routing defect that a person must resolve — Alloy must not pick
-- a winner, because the loser's families would have their texts delivered into
-- another organization. Fail with something actionable instead.
--
-- The message deliberately reports a COUNT and the destinations, never the
-- organizations — the same discretion the runtime collision message keeps.
DO $$
DECLARE
    dupe_count integer;
    dupe_list text;
BEGIN
    SELECT count(*), string_agg(DISTINCT destination, ', ')
    INTO dupe_count, dupe_list
    FROM (
        SELECT btrim(inbound_to_e164) AS destination
        FROM public.communication_provider_bindings
        WHERE inbound_to_e164 IS NOT NULL
          AND btrim(inbound_to_e164) <> ''
        GROUP BY provider, channel, btrim(inbound_to_e164)
        HAVING count(*) > 1
    ) AS duplicates;

    IF COALESCE(dupe_count, 0) > 0 THEN
        RAISE EXCEPTION
            'Cannot enforce one-tenant ownership of inbound SMS destinations: % destination(s) are claimed by more than one binding (%). Resolve the duplicate claim before applying this migration — Alloy must not choose which tenant owns a number.',
            dupe_count, dupe_list;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The constraint
-- ---------------------------------------------------------------------------
--
-- `communication_bindings_org_inbound_to_uq` is deliberately LEFT IN PLACE. It is
-- subsumed by this index rather than contradicted by it, and dropping a constraint
-- to add a stricter one is a window during which neither holds.
CREATE UNIQUE INDEX IF NOT EXISTS communication_bindings_inbound_to_e164_uq
    ON public.communication_provider_bindings (provider, channel, btrim(inbound_to_e164))
    WHERE inbound_to_e164 IS NOT NULL AND btrim(inbound_to_e164) <> '';

COMMENT ON INDEX public.communication_bindings_inbound_to_e164_uq IS
    'One inbound SMS destination resolves to exactly one tenant, enforced globally rather than per-organization. Mirrors communication_bindings_inbound_address_uq for email so cross-org collision is impossible to configure rather than handled at read time.';

-- =============================================================================
-- Location Topology — mutation backstop for child and dependent legality
-- =============================================================================
-- Topology V1 gave `validate_location_hierarchy()` every rule it needed about
-- the row being written. What it never had was a rule about everything ELSE that
-- row is responsible for. A location can be perfectly legal from its own
-- perspective while leaving the tree beneath it illegal, or leaving a committed
-- placement pointing at something that is no longer a classroom:
--
--   DEFECT A  Room 1 (physical_space) contains Toddler 1 and Toddler 2.
--             UPDATE Room 1 SET unit_role = 'shared_space' validates — Room 1's
--             own parent is still the site — and the two groups are left nested
--             inside something that may not contain them.
--
--   DEFECT B  Toddler 1 is named by a live `child_placements` row.
--             UPDATE Toddler 1 SET unit_role = 'physical_space' validates, and
--             the placement now asserts that a child belongs to a room which is
--             not an operational group.
--
-- Both were dormant only because no write path could express a topology change.
-- The server-side mutation authority (lib/location/topologyMutationAuthority.ts)
-- now refuses them with a named reason, but a server preflight is a READ: the
-- tree or the placements can change between the check and the UPDATE. Only a
-- constraint evaluated inside the writing transaction is actually safe, so these
-- rules live here as well, and this layer — not the preflight — is what makes
-- the invariant true.
--
-- WHAT THIS CHANGES
--  1. `validate_location_hierarchy()` gains two UPDATE-only guards: child
--     legality and live-placement legality. Every rule it already had is kept
--     verbatim; nothing that validated before stops validating.
--  2. A partial index so the placement guard is a lookup rather than a scan.
--
-- Deliberately NOT changed: no row is rewritten, no role is back-filled, no
-- location is recreated. A legacy unit with NULL unit_role still reads as
-- `operational_group`, and direct-site classrooms are untouched.
--
-- Re-runnable: CREATE OR REPLACE plus IF NOT EXISTS throughout.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Make the live-placement guard cheap.
-- -----------------------------------------------------------------------------
-- Role changes are rare, but the guard runs inside the writing transaction and
-- must not degrade into a seq scan on a large placement history.
CREATE INDEX IF NOT EXISTS idx_child_placements_live_by_room
    ON public.child_placements (room_location_id)
    WHERE room_location_id IS NOT NULL
      AND status IN ('planned', 'active', 'ending');

-- -----------------------------------------------------------------------------
-- 2) The hierarchy guard, now answering for what the row is responsible for.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_location_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    parent_type text;
    parent_role text;
    parent_parent uuid;
    resolved_site uuid;
    old_role text;
    new_role text;
    child_count int;
    live_placements int;
    old_site uuid;
    new_site uuid;
BEGIN
    -- =========================================================================
    -- UPDATE-only guards. These run FIRST and independently of the parent
    -- checks below, because a row whose parent is unchanged (or NULL) still owes
    -- an answer about its own children and dependents.
    -- =========================================================================
    IF TG_OP = 'UPDATE' THEN
        -- Read OLD's role from the OLD tuple, not from the table: inside a BEFORE
        -- trigger a table read would work, but the tuple is the authority and
        -- leaves no question about which version was seen.
        old_role := CASE
            WHEN OLD.location_type <> 'unit' THEN NULL
            ELSE COALESCE(OLD.unit_role, 'operational_group')
        END;
        new_role := CASE
            WHEN NEW.location_type <> 'unit' THEN NULL
            ELSE COALESCE(NEW.unit_role, 'operational_group')
        END;

        -- -- CHILD LEGALITY (Defect A) ------------------------------------
        -- Only a physical_space may contain other units. If this row is losing
        -- that role — or ceasing to be a unit at all — while units still sit
        -- inside it, refuse. Never orphan, re-parent or reclassify the children:
        -- the operator moves them out first, deliberately.
        IF old_role = 'physical_space' AND new_role IS DISTINCT FROM 'physical_space' THEN
            SELECT count(*) INTO child_count
            FROM public.locations c
            WHERE c.parent_location_id = NEW.id
              AND c.location_type = 'unit';

            IF child_count > 0 THEN
                RAISE EXCEPTION
                    'locations: % still contains % nested room(s); move them out before changing its type',
                    NEW.id, child_count
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        -- -- DEPENDENT LEGALITY (Defect B) --------------------------------
        -- A child is placed into an operational group, never into a physical
        -- space or a shared space. A role change that strands a LIVE placement
        -- would make that placement semantically false.
        --
        -- Closed history (ended / superseded / canceled) is deliberately NOT
        -- protected: the child DID belong to that group while it was one, and a
        -- later reclassification does not make the record false. Freezing a
        -- location forever because it once held a placement is over-blocking.
        IF old_role = 'operational_group' AND new_role IS DISTINCT FROM 'operational_group' THEN
            SELECT count(*) INTO live_placements
            FROM public.child_placements p
            WHERE p.room_location_id = NEW.id
              AND p.status IN ('planned', 'active', 'ending');

            IF live_placements > 0 THEN
                RAISE EXCEPTION
                    'locations: % has % live placement(s); end them before changing its type',
                    NEW.id, live_placements
                    USING ERRCODE = '23514';
            END IF;
        END IF;

        -- -- SITE ANCESTRY ------------------------------------------------
        -- Moving a unit under a different site invalidates every placement,
        -- attendance and presence row that carries its site id, and none of
        -- those are re-validated when the location moves.
        IF NEW.location_type = 'unit'
           AND NEW.parent_location_id IS DISTINCT FROM OLD.parent_location_id THEN
            old_site := public.location_site_id(OLD.parent_location_id);
            new_site := public.location_site_id(NEW.parent_location_id);
            IF old_site IS NOT NULL AND new_site IS NOT NULL AND old_site <> new_site THEN
                RAISE EXCEPTION
                    'locations: % may not move to a different site (% -> %)',
                    NEW.id, old_site, new_site
                    USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    -- =========================================================================
    -- Everything below is Topology V1, unchanged.
    -- =========================================================================
    IF NEW.parent_location_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.parent_location_id = NEW.id THEN
        RAISE EXCEPTION 'locations: a location cannot be its own parent' USING ERRCODE = '23514';
    END IF;

    SELECT l.location_type, COALESCE(l.unit_role, 'operational_group'), l.parent_location_id
    INTO parent_type, parent_role, parent_parent
    FROM public.locations l
    WHERE l.id = NEW.parent_location_id;

    IF parent_type IS NULL THEN
        RAISE EXCEPTION 'locations: parent location % not found', NEW.parent_location_id
            USING ERRCODE = '23503';
    END IF;

    IF NEW.location_type = 'unit' AND parent_type = 'unit' THEN
        IF parent_role <> 'physical_space' THEN
            RAISE EXCEPTION
                'locations: a unit may only be nested inside a unit whose unit_role is physical_space (parent % is %)',
                NEW.parent_location_id, parent_role
                USING ERRCODE = '23514';
        END IF;
        IF COALESCE(NEW.unit_role, 'operational_group') = 'physical_space' THEN
            RAISE EXCEPTION 'locations: a physical_space may not be nested inside another physical_space'
                USING ERRCODE = '23514';
        END IF;
        IF public.location_site_id(NEW.parent_location_id) IS DISTINCT FROM parent_parent THEN
            RAISE EXCEPTION 'locations: a nested unit must sit under a physical space that belongs directly to a site'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.location_type = 'unit' AND parent_type NOT IN ('site', 'unit') THEN
        RAISE EXCEPTION 'locations: a unit must be parented to a site or a physical space (got %)', parent_type
            USING ERRCODE = '23514';
    END IF;

    IF NEW.location_type = 'unit' THEN
        resolved_site := public.location_site_id(NEW.parent_location_id);
        IF resolved_site IS NULL THEN
            RAISE EXCEPTION 'locations: unit % does not resolve to a site through its parent chain', NEW.id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_location_hierarchy() IS
    'Bounds location nesting AND answers for what a changed row is responsible for: a unit losing physical_space while it still contains units is refused, a unit losing operational_group while a live placement names it is refused, and a unit may not move between sites. Closed placement history (ended/superseded/canceled) is deliberately not protected.';

-- -----------------------------------------------------------------------------
-- 3) The trigger already fires on exactly the right columns; re-assert it so a
--    re-run converges even if an earlier apply left it dropped.
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_validate_location_hierarchy ON public.locations;
CREATE TRIGGER trg_validate_location_hierarchy
    BEFORE INSERT OR UPDATE OF parent_location_id, location_type, unit_role ON public.locations
    FOR EACH ROW EXECUTE FUNCTION public.validate_location_hierarchy();

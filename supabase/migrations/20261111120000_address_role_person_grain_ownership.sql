-- =============================================================================
-- Address role — the purpose of an address, at person grain
-- =============================================================================
-- Admissions v12 asks for a Home address belonging to a guardian and a Mailing
-- address belonging to a billing contact. The platform could represent neither,
-- and the reason was narrower than it looked.
--
-- WHAT ALREADY EXISTED, and is not rebuilt here
--
--   * The address itself is a `locations` row with `location_type = 'address'`,
--     carrying `customer_id`, the lines, and `is_primary`.
--   * PERSON OWNERSHIP ALREADY EXISTS. `person_locations` associates a person
--     with a location — org-scoped, with `relationship_type` and `is_primary` —
--     and it is live: the quote flow links a person to their service address and
--     the person drawer reads it back. No junction needs inventing.
--
-- WHAT WAS ACTUALLY MISSING
--
-- A typed PURPOSE. Nothing distinguished the address a family lives at from the
-- address they want post sent to. `person_locations.relationship_type` is not it:
-- it is free text describing the KIND OF LINK — its live values are 'associated'
-- and 'enrolled_classroom' — and it cannot type a household-shared address at
-- all, because such a row has no person. `locations.label` is not it either; it
-- is operator free text ("Primary address", or a street line).
--
-- So one nullable column, on the row that owns the address.
--
--   Household shared home    customer = Family A, no person link, role = 'home'
--   Guardian's own home      customer = Family A, person_locations -> Mom, 'home'
--   Billing contact mailing  customer = Family A, person_locations -> Gran, 'mailing'
--
-- Deliberately two values. A larger taxonomy would be invented rather than
-- required: 'home' and 'mailing' are what authored forms actually ask for, and a
-- vocabulary is cheap to extend and expensive to retract.
--
-- BACKWARD COMPATIBILITY
--
-- NULL means "not stated", never 'home'. Every existing address row keeps
-- working and keeps satisfying household/shared reads exactly as before; nothing
-- is back-filled, and no address is assigned to a person. Inferring that a
-- household's one legacy address is its guardian's home would be a guess written
-- into the record.
--
-- Follows `unit_role` (20260909210000) byte for byte in shape: nullable column,
-- CHECK for the vocabulary, CHECK that it is meaningless on the wrong row type,
-- COMMENT for the contract. Re-runnable throughout.
-- =============================================================================

ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS address_role text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'locations_address_role_check'
    ) THEN
        ALTER TABLE public.locations
            ADD CONSTRAINT locations_address_role_check CHECK (
                address_role IS NULL
                OR address_role = ANY (ARRAY[
                    'home'::text,
                    'mailing'::text
                ])
            );
    END IF;
END$$;

-- A purpose is meaningless on a site or a classroom; refuse it rather than
-- storing a value nothing reads. Same reasoning as locations_unit_role_only_on_unit.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'locations_address_role_only_on_address'
    ) THEN
        ALTER TABLE public.locations
            ADD CONSTRAINT locations_address_role_only_on_address CHECK (
                address_role IS NULL OR location_type = 'address'
            );
    END IF;
END$$;

COMMENT ON COLUMN public.locations.address_role IS
    'Purpose of an address location: home (where the family lives) | mailing (where post should go). NULL means not stated and is the state of every address recorded before this column existed — it is never read as home. Only permitted when location_type = ''address''. WHOSE address it is comes from person_locations; a row with no person link is the household''s shared address.';

-- -----------------------------------------------------------------------------
-- Reading a person's address is a two-key lookup (person, then purpose), and it
-- is about to happen on every participant form bootstrap. Partial, because only
-- address rows can carry a role.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS locations_customer_address_role_idx
    ON public.locations (customer_id, address_role)
    WHERE location_type = 'address';

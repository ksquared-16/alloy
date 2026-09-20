-- =============================================================================
-- Staff & Workforce V2 · Slice 1 — Employment identifiers
--
-- Two OPERATOR-FACING identifiers, both owned by Employment:
--
--   Employee Number   employments.external_employee_id   (already exists)
--   Badge Number      employments.badge_number           (added here)
--
-- The physical column `external_employee_id` is NOT renamed. Its operator label
-- becomes "Employee Number" in presentation only; a destructive rename would buy
-- terminology at the cost of every consumer.
--
-- WHAT THESE ARE NOT. Neither identifier is Person identity, neither is an
-- authentication secret, and neither grants any Alloy access — `employments`
-- already states "Employment confers NO Alloy access" and nothing here changes
-- that. `person_kiosk_codes` remains the hashed credential authority and is
-- untouched: a badge number is scanned and readable, a kiosk PIN is hashed and
-- secret, and conflating them would turn a printed number into a credential.
-- No RFID/NFC/provider credential family is built here.
--
-- UNIQUENESS IS NORMALIZED AND PARTIAL, mirroring `contacts_email_unique`, which
-- is this codebase's established shape for "unique when populated":
--
--     unique on (org_id, lower(btrim(value))) where the trimmed value is non-empty
--
-- Normalized, so "A-100", "a-100" and " a-100 " are one identifier rather than
-- three. Partial, so the many rows with no identifier do not collide with each
-- other — NULL would not collide anyway, but a blank string would, and the
-- not-blank CHECK plus this predicate close that door from both sides.
--
-- The two namespaces are SEPARATE indexes on purpose. An employee number and a
-- badge number may legitimately be the same string, and often will be while an
-- organization is issuing both from one series.
--
-- NO BACKFILL. The deployed primary was censused immediately before this
-- migration was written (gar_33b06aa3b60143, 2026-09-20T21:18:41Z): 4
-- employments, 0 populated external_employee_id, 0 exact collisions, 0
-- normalized collisions, 0 values needing normalization, 0 placeholder values.
-- There is nothing to migrate, which is why the invariant can be added as a
-- plain index rather than a repair.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Badge Number storage
-- -----------------------------------------------------------------------------
ALTER TABLE public.employments
    ADD COLUMN IF NOT EXISTS badge_number text;

COMMENT ON COLUMN public.employments.badge_number IS
    'Operator-facing SCANNABLE employment identifier ("Badge Number"). Org-unique when populated, normalized by trim + case fold. Not Person identity, not a credential, not a kiosk PIN (see person_kiosk_codes), and confers no access. Stable across site/classroom assignment.';

COMMENT ON COLUMN public.employments.external_employee_id IS
    'Operator-facing organization-assigned employment identifier ("Employee Number"). Org-unique when populated, normalized by trim + case fold. The column name is historical; operator copy says Employee Number.';

-- A blank string must not become a meaningful identifier. `external_employee_id`
-- has carried this rule since the employment foundation; badge gets the same one.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'employments_badge_number_not_blank_check'
          AND conrelid = 'public.employments'::regclass
    ) THEN
        ALTER TABLE public.employments
            ADD CONSTRAINT employments_badge_number_not_blank_check
            CHECK (badge_number IS NULL OR length(btrim(badge_number)) > 0);
    END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 2) Normalized org uniqueness — one index per identifier namespace
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS employments_org_employee_number_unique
    ON public.employments (org_id, lower(btrim(external_employee_id)))
    WHERE external_employee_id IS NOT NULL
      AND length(btrim(external_employee_id)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS employments_org_badge_number_unique
    ON public.employments (org_id, lower(btrim(badge_number)))
    WHERE badge_number IS NOT NULL
      AND length(btrim(badge_number)) > 0;

COMMENT ON INDEX public.employments_org_employee_number_unique IS
    'Employee Number is unique within an organization when populated, compared trimmed and case-folded. Different organizations may issue the same number.';
COMMENT ON INDEX public.employments_org_badge_number_unique IS
    'Badge Number is unique within an organization when populated, compared trimmed and case-folded. Separate namespace from Employee Number.';

-- -----------------------------------------------------------------------------
-- 3) Why there is no in-migration self-test
-- -----------------------------------------------------------------------------
-- The obvious probe — insert an identifier, insert a case variant, expect
-- unique_violation — cannot run safely here. `employments` carries
-- trg_validate_employments_overlap and trg_validate_employments_consistency, so
-- two probe rows for one person raise the OVERLAP error rather than the unique
-- violation, and a probe that catches only unique_violation would fail this
-- migration for a reason unrelated to the invariant it claims to prove.
--
-- The invariant is proven where it can be observed without inventing employment
-- history: directly against the database in
-- web/tests/staff/employmentIdentifiers.db.test.ts, and through the operator UI
-- in the Slice 1 mounted QA. A migration that cannot fail for an unrelated
-- reason is worth more here than a self-test that can.

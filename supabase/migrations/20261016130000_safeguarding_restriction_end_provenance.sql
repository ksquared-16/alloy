-- Safeguarding V1 — provenance for ENDING a restriction.
--
-- The table already answers "who asserted this" (`created_by`) and "who approved it"
-- (`reviewed_by`). It could not answer "who lifted it", because nothing could lift one: there was
-- no writer at all, so `updated_at` existed with no actor beside it.
--
-- Revoking a protective order is the single most consequential act in this table — it is the moment
-- a barred adult becomes collectable again — and it is exactly the act a safeguarding review would
-- ask about first. One nullable column, symmetric with `created_by`, makes it answerable.
--
-- Re-runnable. No backfill: existing rows were never ended, so NULL is the honest value.
ALTER TABLE public.child_safeguarding_restrictions
    ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.child_safeguarding_restrictions.updated_by IS
    'The operator who last transitioned this restriction (revoked / superseded). NULL means it has never been transitioned since creation.';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'child_safeguarding_restrictions'
          AND column_name = 'updated_by'
    ) THEN
        RAISE EXCEPTION 'updated_by was not added to child_safeguarding_restrictions';
    END IF;
END
$$;

-- Location Program availability: local display name + effective dates.
-- Organization Program identity remains on programs.*; LPC is Location offering.

ALTER TABLE public.location_program_categories
    ADD COLUMN IF NOT EXISTS local_display_name text,
    ADD COLUMN IF NOT EXISTS available_from date,
    ADD COLUMN IF NOT EXISTS available_through date;

COMMENT ON COLUMN public.location_program_categories.local_display_name IS
    'Optional Location-facing display name. Null inherits the Organization Program name.';
COMMENT ON COLUMN public.location_program_categories.available_from IS
    'Inclusive start date for offering this Program at the Location. Null = immediately.';
COMMENT ON COLUMN public.location_program_categories.available_through IS
    'Inclusive end date for offering this Program at the Location. Null = indefinite.';

CREATE INDEX IF NOT EXISTS idx_location_program_categories_availability_window
    ON public.location_program_categories (org_id, location_id, available_from, available_through)
    WHERE program_id IS NOT NULL;

-- Book-v2: persist gate code and pets on service location (used by cleaners / ops).
ALTER TABLE public.locations
    ADD COLUMN IF NOT EXISTS access_code text,
    ADD COLUMN IF NOT EXISTS has_pets boolean;

COMMENT ON COLUMN public.locations.access_code IS 'Door/gate code when customer selects code-based access; optional.';
COMMENT ON COLUMN public.locations.has_pets IS 'Whether pets are present at the service address.';

-- Vendor statuses: key/label/position for admin dropdown and vendor onboarding default.

CREATE TABLE IF NOT EXISTS public.vendor_statuses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text NOT NULL UNIQUE,
    label text NOT NULL,
    position int NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true
);

COMMENT ON TABLE public.vendor_statuses IS 'Lookup table for vendor status; vendors.vendor_status_id references this.';

-- Seed statuses (idempotent: insert only if missing)
INSERT INTO public.vendor_statuses (key, label, position, is_active)
VALUES
    ('pending', 'Pending', 1, true),
    ('approved', 'Approved', 2, true),
    ('rejected', 'Rejected', 3, true),
    ('suspended', 'Suspended', 4, true)
ON CONFLICT (key) DO NOTHING;

-- Add FK from vendors to vendor_statuses
ALTER TABLE public.vendors
ADD COLUMN IF NOT EXISTS vendor_status_id uuid REFERENCES public.vendor_statuses(id);

CREATE INDEX IF NOT EXISTS vendors_vendor_status_id_idx ON public.vendors (vendor_status_id);

COMMENT ON COLUMN public.vendors.vendor_status_id IS 'Current status; default for new applications is pending.';

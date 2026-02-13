-- Vendor assignment on jobs; vendor–contact association for admin "Vendor Management".

-- Jobs: optional assignment to a vendor (canonical provider entity).
ALTER TABLE public.jobs
ADD COLUMN IF NOT EXISTS vendor_id uuid REFERENCES public.vendors(id);

CREATE INDEX IF NOT EXISTS jobs_vendor_id_idx ON public.jobs (vendor_id);
COMMENT ON COLUMN public.jobs.vendor_id IS 'Vendor (contractor) assigned to this job; used for vendor detail Jobs section.';

-- Optional vendor ops fields (v1 editable, not used for logic yet).
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS max_daily_jobs int;
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS payout_percent numeric(5,2);

-- Join table: vendors <-> contacts (many contacts per vendor business).
CREATE TABLE IF NOT EXISTS public.vendor_contacts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id uuid NOT NULL REFERENCES public.vendors(id) ON DELETE CASCADE,
    contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    role text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(vendor_id, contact_id)
);

CREATE INDEX IF NOT EXISTS vendor_contacts_vendor_id_idx ON public.vendor_contacts (vendor_id);
CREATE INDEX IF NOT EXISTS vendor_contacts_contact_id_idx ON public.vendor_contacts (contact_id);
COMMENT ON TABLE public.vendor_contacts IS 'Contacts associated to a vendor business; primary_contact_id is the main one.';

-- Seed: ensure every vendor has its primary_contact_id in vendor_contacts (idempotent).
INSERT INTO public.vendor_contacts (vendor_id, contact_id, role)
SELECT v.id, v.primary_contact_id, 'primary'
FROM public.vendors v
WHERE v.primary_contact_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.vendor_contacts vc
    WHERE vc.vendor_id = v.id AND vc.contact_id = v.primary_contact_id
  )
ON CONFLICT (vendor_id, contact_id) DO NOTHING;

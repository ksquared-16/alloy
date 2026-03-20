-- Canonical human link for vendors (Person-first onboarding). primary_contact_id remains for legacy rows.
ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS primary_person_id uuid REFERENCES public.persons (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vendors_primary_person_id_idx ON public.vendors (primary_person_id);

COMMENT ON COLUMN public.vendors.primary_person_id IS 'Canonical primary person for this vendor (e.g. Join Our Team / contractor identity).';

-- Migration: Add verticals and contact_verticals tables for multi-vertical support
-- This enables contacts to be associated with multiple verticals (cleaning, gutters, etc.)

-- Create verticals table
CREATE TABLE IF NOT EXISTS public.verticals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT NOT NULL UNIQUE, -- e.g., "cleaning", "gutters"
    name TEXT NOT NULL, -- e.g., "Home Cleaning", "Gutter Cleaning"
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create contact_verticals join table (many-to-many relationship)
CREATE TABLE IF NOT EXISTS public.contact_verticals (
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    vertical_id UUID NOT NULL REFERENCES public.verticals(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (contact_id, vertical_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contact_verticals_contact_id ON public.contact_verticals(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_verticals_vertical_id ON public.contact_verticals(vertical_id);
CREATE INDEX IF NOT EXISTS idx_verticals_key ON public.verticals(key);

-- Insert default verticals if they don't exist
INSERT INTO public.verticals (key, name) VALUES
    ('cleaning', 'Home Cleaning'),
    ('gutters', 'Gutter Cleaning')
ON CONFLICT (key) DO NOTHING;

-- Add comment for documentation
COMMENT ON TABLE public.verticals IS 'Service verticals (cleaning, gutters, etc.)';
COMMENT ON TABLE public.contact_verticals IS 'Many-to-many relationship between contacts and verticals';


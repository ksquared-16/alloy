-- Recurrence fields on pricing_frequencies for subscription next-occurrence computation.
-- recurrence_unit = 'week' | 'month', recurrence_interval = int (e.g. every 2 weeks = week/2).

ALTER TABLE public.pricing_frequencies ADD COLUMN IF NOT EXISTS recurrence_unit text;
ALTER TABLE public.pricing_frequencies ADD COLUMN IF NOT EXISTS recurrence_interval int;

-- Backfill from frequency_label / frequency_key
UPDATE public.pricing_frequencies
SET recurrence_unit = 'week', recurrence_interval = 1
WHERE (recurrence_unit IS NULL OR recurrence_interval IS NULL)
  AND (LOWER(COALESCE(frequency_label, frequency_key, '')) LIKE '%weekly%' OR LOWER(COALESCE(frequency_key, '')) = 'weekly');

UPDATE public.pricing_frequencies
SET recurrence_unit = 'week', recurrence_interval = 2
WHERE (recurrence_unit IS NULL OR recurrence_interval IS NULL)
  AND (LOWER(COALESCE(frequency_label, frequency_key, '')) LIKE '%bi%week%' OR LOWER(COALESCE(frequency_key, '')) = 'biweekly');

UPDATE public.pricing_frequencies
SET recurrence_unit = 'month', recurrence_interval = 1
WHERE (recurrence_unit IS NULL OR recurrence_interval IS NULL)
  AND (LOWER(COALESCE(frequency_label, frequency_key, '')) LIKE '%month%' OR LOWER(COALESCE(frequency_key, '')) = 'monthly');

UPDATE public.pricing_frequencies
SET recurrence_unit = 'month', recurrence_interval = 3
WHERE (recurrence_unit IS NULL OR recurrence_interval IS NULL)
  AND (LOWER(COALESCE(frequency_label, frequency_key, '')) LIKE '%quarter%' OR LOWER(COALESCE(frequency_key, '')) = 'quarterly');

COMMENT ON COLUMN public.pricing_frequencies.recurrence_unit IS 'Recurrence unit for subscription: week or month';
COMMENT ON COLUMN public.pricing_frequencies.recurrence_interval IS 'Number of recurrence_unit between occurrences (e.g. 2 = every 2 weeks)';

-- Admin quote workflow: manual override metadata (does not replace discount columns when set).
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS quote_is_overridden boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS quote_override_total numeric(10,2),
  ADD COLUMN IF NOT EXISTS quote_override_reason text;

COMMENT ON COLUMN public.opportunities.quote_is_overridden IS
  'When true, quote_total is the manual override; automatic quote pricing RPC must not replace totals until cleared.';
COMMENT ON COLUMN public.opportunities.quote_override_total IS
  'Manual total in dollars when quote_is_overridden is true.';
COMMENT ON COLUMN public.opportunities.quote_override_reason IS
  'Optional operator reason for a manual quote override.';

-- Short public URLs for action links: /a/{short_code} → resolves to full token (/action/{token}).
-- Backfill existing rows in production if needed, e.g.:
--   UPDATE action_links SET short_code = encode(gen_random_bytes(5), 'hex') WHERE short_code IS NULL;
-- (ensure uniqueness per row / retry collisions)

ALTER TABLE public.action_links
    ADD COLUMN IF NOT EXISTS short_code text;

CREATE UNIQUE INDEX IF NOT EXISTS action_links_short_code_key ON public.action_links (short_code)
    WHERE short_code IS NOT NULL;

COMMENT ON COLUMN public.action_links.short_code IS 'Short opaque code for SMS-friendly /a/{code} URLs; maps to token.';

-- Ops: consolidate duplicate booking_confirmed customer SMS actions in workflow_actions to a single
-- create_message using template vars formatted_start_at, short_reschedule_url, short_cancel_url (and/or
-- booking_confirmation_sms_body). Remove extra create_message / send_message rows that only sent reschedule copy.

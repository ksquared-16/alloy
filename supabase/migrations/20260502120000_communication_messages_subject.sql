-- Outbound email subject line (composer + worker / Resend). Nullable for SMS/in-app and legacy rows.
ALTER TABLE public.communication_messages
  ADD COLUMN IF NOT EXISTS subject text NULL;

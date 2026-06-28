-- =============================================================================
-- POS Family Packet — packet instance grouping (additive)
-- =============================================================================
-- Lets multiple recipient public links resolve to ONE shared packet session (the
-- "packet instance"), so household/child answers and progress are shared across a
-- family's recipients and siblings. Recipient identity stays distinct in link metadata.
--
-- Additive only: one nullable column + indexes on form_packet_sessions. Legacy links
-- (no packet_instance_id) keep the existing one-session-per-link behavior.
-- =============================================================================

ALTER TABLE public.form_packet_sessions
    ADD COLUMN IF NOT EXISTS packet_instance_id uuid;

COMMENT ON COLUMN public.form_packet_sessions.packet_instance_id IS
    'Family Packet instance id. When set, all recipient links for this instance resolve to THIS one session (shared answers). NULL = legacy one-session-per-link.';

-- Lookup: find the single session for an instance.
CREATE INDEX IF NOT EXISTS idx_form_packet_sessions_org_instance
    ON public.form_packet_sessions (org_id, packet_instance_id)
    WHERE packet_instance_id IS NOT NULL;

-- Exactly one session per (org, instance) — prevents duplicate sessions under a launch race.
CREATE UNIQUE INDEX IF NOT EXISTS uq_form_packet_sessions_one_per_instance
    ON public.form_packet_sessions (org_id, packet_instance_id)
    WHERE packet_instance_id IS NOT NULL;

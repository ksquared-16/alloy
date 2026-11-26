-- Location becomes part of a conversation's identity.
--
-- THE PROBLEM: `communication_threads_identity_uq` is
-- `(org_id, primary_entity_type, primary_entity_id, channel, recipient_key)` — no
-- location. So one parent, one channel, one entity means exactly ONE thread for
-- the whole organization. A family enrolled at Riverside and Lakeside has their
-- Riverside conversation and their Lakeside conversation filed as the same
-- conversation, and there is no way to answer "which location is this?" — which
-- means there is no way to choose which location's identity to reply from.
--
-- Communications identity cannot be location-aware while the CONVERSATION is not.
-- This migration is the prerequisite for that, and nothing else.
--
-- ---------------------------------------------------------------------------
-- Why NULLS NOT DISTINCT, and why it is the whole design
-- ---------------------------------------------------------------------------
--
-- Naively adding `location_id` to the constraint would be a correctness disaster.
-- PostgreSQL treats NULLs as DISTINCT in unique constraints by default, so every
-- organization-default thread (location_id IS NULL — which today is ALL 45 of
-- them) would stop colliding with itself. Idempotent upsert would break silently:
-- every inbound message would mint a new thread, and a parent's conversation
-- would shatter into one thread per message.
--
-- `NULLS NOT DISTINCT` (PostgreSQL 15+; this deployment is 17.6) makes NULL equal
-- to NULL for uniqueness. So:
--
--   location_id IS NULL     → exactly one org-default thread, as today
--   location_id = Riverside → its own thread
--   location_id = Lakeside  → its own thread
--
-- Existing behaviour is preserved EXACTLY for every current row, because every
-- current row has location_id IS NULL. This is an identity refinement, not a
-- reinterpretation: nothing that is one conversation today becomes two.
--
-- The alternative — a sentinel UUID in a generated column — was rejected. It
-- works on older PostgreSQL, but it puts a fake location id in a foreign-keyed
-- column's shadow and every reader has to know the magic value. NULL already
-- means "no location"; the database just needs to be told to compare it.
--
-- Additive in effect. No data mutation, no backfill, no thread is split.

-- ---------------------------------------------------------------------------
-- Guard: prove the refinement cannot merge or split anything
-- ---------------------------------------------------------------------------
--
-- Adding a column to a unique key can only ever RELAX it, so no existing row can
-- newly collide. But a row whose location_id is already set would, under the new
-- key, be free to coexist with a NULL-location twin — a latent duplicate that
-- was previously impossible. Nothing should be in that state, and if something
-- is, a human should look before the constraint changes underneath it.
DO $$
DECLARE
    located_count integer;
BEGIN
    SELECT count(*) INTO located_count
    FROM public.communication_threads
    WHERE location_id IS NOT NULL;

    IF located_count > 0 THEN
        RAISE NOTICE
            'communication_threads: % row(s) already carry a location. The refined identity key admits a NULL-location twin for each; verify none is a duplicate conversation.',
            located_count;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- The refined identity
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated inside the migration's transaction, so there is no
-- instant at which neither key is enforced.
ALTER TABLE public.communication_threads
    DROP CONSTRAINT IF EXISTS communication_threads_identity_uq;

ALTER TABLE public.communication_threads
    ADD CONSTRAINT communication_threads_identity_uq
    UNIQUE NULLS NOT DISTINCT (org_id, primary_entity_type, primary_entity_id, channel, recipient_key, location_id);

COMMENT ON CONSTRAINT communication_threads_identity_uq ON public.communication_threads IS
    'Conversation identity, including location. NULLS NOT DISTINCT so location_id IS NULL is a single organization-default conversation rather than one per message — without it, idempotent thread upsert breaks silently.';

-- Reply-side lookups resolve a thread by (org, channel, recipient, location), so
-- the identity key serves them. This index serves the other direction: listing
-- an organization's conversations for one location, which the operator inbox and
-- location-scoped views ask for.
CREATE INDEX IF NOT EXISTS idx_comm_threads_org_location_channel
    ON public.communication_threads (org_id, location_id, channel)
    WHERE location_id IS NOT NULL;

COMMENT ON COLUMN public.communication_threads.location_id IS
    'Authoritative location of the conversation. Outbound: carried from the originating operational context. Inbound: derived from the RECEIVING identity (the address or number the family wrote to), never from the sender and never guessed from the household. NULL means the conversation belongs to the organization rather than a location.';

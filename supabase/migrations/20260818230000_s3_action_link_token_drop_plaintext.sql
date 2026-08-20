-- S-3, second half — the plaintext bearer token leaves the database.
--
-- `20260818220000` added `token_hash`, backfilled every row, indexed it, and made `token` nullable
-- so the mint could stop writing it. This drops the column.
--
-- **These are two migrations on purpose, and the gap between them is the dual-read window.** Apply
-- the first, deploy the code that reads `token_hash`, THEN apply this. Applying both before the
-- deploy would leave any still-running process selecting a column that no longer exists — the
-- deploy-ordering hazard that makes a one-migration version of this change unsafe on an
-- environment serving traffic. On the certification tenant the code and schema move together, so
-- the window is zero-width there; the separation exists for every environment where it is not.
--
-- **Nothing is lost.** Verification never needed the plaintext back — a recipient presents the token
-- and the digest is recomputed and matched. That is the whole reason a one-way hash is the correct
-- storage for a bearer credential, and it is why no live link is invalidated by this.
--
-- The unique constraint on the plaintext column goes with it; `action_links_token_hash_uidx`
-- (created by the first half) already carries the uniqueness the mint's retry loop depends on.

-- ---------------------------------------------------------------------------
-- 1. Fail closed: refuse to drop while any row is addressable ONLY by plaintext.
--
--    If a row somehow reached this point with a token but no hash, dropping the column would strand
--    that link permanently. This is the same abort the first half performs, re-run at the moment it
--    actually becomes irreversible.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
    unhashed bigint;
BEGIN
    SELECT count(*) INTO unhashed
    FROM public.action_links
    WHERE token_hash IS NULL;

    IF unhashed > 0 THEN
        RAISE EXCEPTION
            'S-3 aborted: % action_links row(s) have no token_hash. Dropping the plaintext column would strand those links irrecoverably.',
            unhashed;
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 2. The drop. Guarded so a replay is a no-op rather than an error.
-- ---------------------------------------------------------------------------

ALTER TABLE public.action_links
    DROP CONSTRAINT IF EXISTS action_links_token_key;

ALTER TABLE public.action_links
    DROP COLUMN IF EXISTS token;

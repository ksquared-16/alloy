-- S-3 — the action-link bearer token stops being stored in the clear.
--
-- `action_links.token` holds the COMPLETE bearer credential in plaintext, `NOT NULL` and `UNIQUE`.
-- Anyone who can read the table can act as every recipient who holds an unconsumed link — and those
-- recipients are outside the organization: vendors, contacts, families. The token IS the
-- authorization boundary for that whole family of routes (`RL-32`), so storing it readable is the
-- one place where a database read is equivalent to holding every credential at once.
--
-- **This is not a new authentication architecture. The remediation already exists in this
-- repository and is only being extended to a second family.** `form_links` has stored `token_hash`
-- from the start: `lib/public/forms/tokenHash.ts` computes a SHA-256 hex digest of the UTF-8 token
-- and `resolvePublicFormLink` looks the row up with `.eq("token_hash", …)`. That module also states
-- what actually defends the path — *"the comparison is Postgres's, on an indexed column, against a
-- 256-bit digest… there is no per-byte early exit to time, because there is no per-byte compare in
-- the application."* The same shape, the same defence, applied to `action_links`.
--
-- **No live link is invalidated, which is what made the prior session decline this.** Its record
-- says the conversion *"INVALIDATES EVERY LIVE UNCONSUMED LINK unless it is done as a dual-read
-- window"*. It does not, if the existing tokens are hashed in place: verification never needs the
-- plaintext back, only the ability to recognise a token the recipient presents. §1 below backfills
-- every row, so a link mailed yesterday still resolves tomorrow.
--
-- Digest equivalence was verified against the running database rather than assumed — Node's
-- `createHash("sha256").update(t,"utf8").digest("hex")` and Postgres
-- `encode(sha256(convert_to(t,'UTF8')),'hex')` produce byte-identical output for the same input.
--
-- **The plaintext column is NOT dropped here, deliberately.** Dropping it in the same migration that
-- switches the readers is a deploy-ordering hazard: any process still running the old code would
-- read a column that no longer exists. The drop is authored separately
-- (`…_s3_action_link_token_drop_plaintext.sql`) so it can be sequenced AFTER the code is live. That
-- is the dual-read window the accepted remediation asks for, expressed as two migrations rather
-- than as a flag.
--
-- What this migration guarantees on its own: every row is addressable by hash, no NEW row may carry
-- plaintext (the column becomes nullable and the mint stops writing it), and lookups have an index.

-- ---------------------------------------------------------------------------
-- 1. The hash column, backfilled from the plaintext that is still present.
-- ---------------------------------------------------------------------------

ALTER TABLE public.action_links
    ADD COLUMN IF NOT EXISTS token_hash text;

UPDATE public.action_links
SET token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex')
WHERE token_hash IS NULL
  AND token IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Fail closed: every row must be addressable by hash before the readers switch.
--
--    A row that reaches this point without a hash would become unreachable the moment lookups move
--    to `token_hash` — a link silently dead in a recipient's inbox, which is exactly the outcome
--    the prior session feared and the reason this check is an abort rather than a warning.
-- ---------------------------------------------------------------------------

DO $preflight$
DECLARE
    unhashed bigint;
BEGIN
    SELECT count(*) INTO unhashed FROM public.action_links WHERE token_hash IS NULL;
    IF unhashed > 0 THEN
        RAISE EXCEPTION
            'S-3 aborted: % action_links row(s) have no token_hash after backfill. Switching lookups now would strand those links. Investigate before re-running.',
            unhashed;
    END IF;
END
$preflight$;

-- ---------------------------------------------------------------------------
-- 3. The lookup shape. Unique, because it mirrors the plaintext column's own uniqueness and because
--    a duplicate digest would make "which link is this" ambiguous.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS action_links_token_hash_uidx
    ON public.action_links (token_hash);

-- ---------------------------------------------------------------------------
-- 4. Stop REQUIRING plaintext, so a mint can omit it from this point forward.
--
--    The column and its unique constraint stay until the follow-up drop; only the obligation to
--    populate it goes. Existing rows are untouched.
-- ---------------------------------------------------------------------------

ALTER TABLE public.action_links
    ALTER COLUMN token DROP NOT NULL;

COMMENT ON COLUMN public.action_links.token_hash IS
    'S-3: SHA-256 hex digest of the bearer token, matching lib/public/forms/tokenHash.ts. Lookups use this column; the plaintext `token` is retained only for the dual-read window and is dropped by the follow-up migration.';

COMMENT ON COLUMN public.action_links.token IS
    'S-3: DEPRECATED plaintext bearer token. Nullable from this migration; new links do not populate it. Dropped by …_s3_action_link_token_drop_plaintext.sql once the hash-reading code is live.';
